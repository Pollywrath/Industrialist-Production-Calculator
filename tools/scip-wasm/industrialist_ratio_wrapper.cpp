#include <emscripten/emscripten.h>

#include <scip/cons_linear.h>
#include <scip/scip.h>
#include <scip/scipdefplugins.h>

#include <soplex.h>

#include <algorithm>
#include <atomic>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <iomanip>
#include <limits>
#include <mutex>
#include <new>
#include <sstream>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {

constexpr double kStageBoundAbsoluteTolerance = 1e-6;
constexpr double kTargetMachineBoundCap = 1e4;
constexpr double kValidationAbsoluteTolerance = 1e-6;
constexpr double kValidationRelativeTolerance = 1e-7;
constexpr double kIntegralityTolerance = 1e-7;
constexpr double kMachineIntegerRelativeTolerance =
  std::numeric_limits<double>::epsilon() * 8.0;
constexpr double kZeroRateConnectionEpsilon = 1e-12;
constexpr double kBinaryResultMagic = 444926465.0; // "IRLP" as an exact small integer marker.
constexpr double kBinaryResultVersion = 2.0;
constexpr int kBinaryResultHeaderDoubles = 28;
constexpr double kBinaryPayloadMagic = 444926466.0;
constexpr double kBinaryPayloadVersion = 4.0;
constexpr int kBinaryPayloadHeaderDoubles = 39;
constexpr int kBinaryPayloadNodeDoubles = 13;
constexpr int kBinaryPayloadInputDoubles = 2;
constexpr int kBinaryPayloadOutputDoubles = 2;
constexpr int kBinaryPayloadConnectionDoubles = 4;
constexpr int kMetricCount = 6;
constexpr int kMaxObjectiveTiers = 3;

enum MetricIndex {
  PowerUse = 0,
  PowerOutput = 1,
  Pollution = 2,
  MachineCost = 3,
  MachineSpace = 4,
  ModelCount = 5,
};

struct MetricConfig {
  bool enabled = false;
  double coefficient = 0.0;
  int tier = 1;
  double limit = -1.0;
  double outputGoal = -1.0;
};

enum class NativeResultStatus {
  Optimal = 1,
  Cancelled = 2,
  Infeasible = 3,
  Unbounded = 4,
  LimitReachedNotProven = 5,
  NumericalFailure = 6,
  InvalidPayload = 7,
  InternalError = 8,
};

enum class VariableKind {
  Continuous,
  Integer,
  Binary,
};

struct InputPort {
  double quantity = 0.0;
  bool isSink = false;
};

struct OutputPort {
  double quantity = 0.0;
  bool hasSinkConnection = false;
};

struct Node {
  std::string id;
  double currentMachineCount = 0.0;
  bool isTarget = false;
  double powerUse = 0.0;
  double powerOutput = 0.0;
  double pollution = 0.0;
  double machineCost = 0.0;
  bool hasInfiniteMachineCost = false;
  double machineSpace = 0.0;
  double modelCount = 0.0;
  std::vector<InputPort> inputs;
  std::vector<OutputPort> outputs;
};

struct Connection {
  std::string id;
  int sourceNode = -1;
  int sourceOutputIndex = -1;
  int targetNode = -1;
  int targetInputIndex = -1;
};

struct NativeInput {
  std::vector<Node> nodes;
  std::vector<Connection> connections;
  std::array<MetricConfig, kMetricCount> metrics{};
  int tierCount = 1;
};

struct TermSpec {
  int varIndex = -1;
  double coeff = 0.0;
};

struct VariableSpec {
  std::string name;
  double lb = 0.0;
  double ub = 0.0;
  double physicalScale = 1.0;
  double shortageCoeff = 0.0;
  double sinkExcessCoeff = 0.0;
  double infiniteMachineCostUsageCoeff = 0.0;
  std::array<double, kMaxObjectiveTiers> tierCoeff{};
  std::array<double, kMaxObjectiveTiers> continuousTierCoeff{};
  double machineCountCoeff = 0.0;
  VariableKind kind = VariableKind::Continuous;
};

struct RowSpec {
  std::string name;
  double lhs = 0.0;
  double rhs = 0.0;
  std::vector<TermSpec> terms;
};

struct ModelSpec {
  std::vector<VariableSpec> vars;
  std::vector<RowSpec> rows;
  std::vector<RowSpec> deferredLimitRows;
  std::vector<int> machineVarByNode;
  std::vector<int> edgeVarByConnection;
  std::vector<std::vector<int>> deficitVarByNodeInput;
  std::vector<int> roundedVarByNode;
  std::vector<std::array<double, kMaxObjectiveTiers>> roundedTierCoeffByNode;
  std::vector<std::array<double, 3>> roundedMetricValueByNode;
  std::array<double, 3> roundedMetricLimits{{-1.0, -1.0, -1.0}};
  int infiniteMachineCostTier = 0;
  double valueScale = 1.0;
  bool hasShortageObjective = false;
  bool hasSinkExcessObjective = false;
  bool hasRoundedObjective = false;
  int tierCount = 1;
};

struct ModelStats {
  int nonzeroCount = 0;
  double minCoefficient = 0.0;
  double maxCoefficient = 0.0;
  double minFiniteBound = 0.0;
  double maxFiniteBound = 0.0;
};

enum class ObjectiveMode {
  Shortage,
  SinkExcess,
  InfiniteMachineCostUsage,
  Tier1,
  Tier2,
  Tier3,
  MachineCount,
};

int getTierIndex(ObjectiveMode objective) {
  if (objective == ObjectiveMode::Tier1) return 0;
  if (objective == ObjectiveMode::Tier2) return 1;
  if (objective == ObjectiveMode::Tier3) return 2;
  return -1;
}

struct SolveOptions {
  const char* profileName = "default";
  bool useNumericsEmphasis = false;
  bool useFastPresolve = false;
  bool disableSymmetry = false;
  bool disableMilpPresolver = false;
};

struct StageSolution {
  double objectiveValue = 0.0;
  double elapsedMs = 0.0;
  std::vector<double> values;
};

struct StageTelemetry {
  std::string name;
  double objectiveValue = 0.0;
  double elapsedMs = 0.0;
};

struct SolveTelemetry {
  std::string profileName;
  double totalMs = 0.0;
  double payloadParseMs = 0.0;
  double modelBuildMs = 0.0;
  double mipNodeCount = 0.0;
  double lpIterations = 0.0;
  double primalBound = 0.0;
  double dualBound = 0.0;
  double mipGap = 0.0;
  int roundedVariableCount = 0;
  std::vector<StageTelemetry> stages;
};

struct NativeSolveResult {
  bool ok = false;
  NativeResultStatus status = NativeResultStatus::InternalError;
  std::string error;
  ModelSpec model;
  StageSolution solution;
  SolveTelemetry telemetry;
};

struct SolveControl {
  volatile bool* interruptFlag = nullptr;
  std::atomic<bool>* cancellationRequested = nullptr;
  std::atomic<int>* stageCode = nullptr;
  std::atomic<SCIP*>* activeScip = nullptr;
  std::mutex* activeScipMutex = nullptr;
};

bool isCancellationRequested(const SolveControl* control) {
  return control != nullptr &&
    control->cancellationRequested != nullptr &&
    control->cancellationRequested->load(std::memory_order_acquire);
}

void setSolveStage(SolveControl* control, int stageCode) {
  if (control != nullptr && control->stageCode != nullptr) {
    control->stageCode->store(stageCode, std::memory_order_release);
  }
}

struct ScipHolder {
  SCIP* scip = nullptr;
  std::vector<SCIP_VAR*> vars;

  ~ScipHolder() {
    if (scip != nullptr) {
      for (SCIP_VAR*& var : vars) {
        if (var != nullptr) {
          SCIPreleaseVar(scip, &var);
        }
      }
      SCIPfree(&scip);
    }
  }
};


double elapsedMilliseconds(std::chrono::steady_clock::time_point start) {
  return std::chrono::duration<double, std::milli>(
    std::chrono::steady_clock::now() - start
  ).count();
}

bool readNonnegativeInt(double value, const char* label, int& out, std::string& error) {
  if (!std::isfinite(value) || value < 0.0 || std::floor(value) != value) {
    error = std::string("Invalid nonnegative integer field in native binary payload: ") + label + ".";
    return false;
  }
  if (value > static_cast<double>(std::numeric_limits<int>::max())) {
    error = std::string("Native binary payload integer field is too large: ") + label + ".";
    return false;
  }
  out = static_cast<int>(value);
  return true;
}

bool readFiniteDouble(double value, const char* label, double& out, std::string& error) {
  if (!std::isfinite(value)) {
    error = std::string("Invalid finite number field in native binary payload: ") + label + ".";
    return false;
  }
  out = value;
  return true;
}

bool parsePayloadArray(const double* payload, int payloadDoubleCount, NativeInput& input, std::string& error) {
  if (payload == nullptr) {
    error = "Native binary ratio payload was null.";
    return false;
  }
  if (payloadDoubleCount < kBinaryPayloadHeaderDoubles) {
    error = "Native binary ratio payload was shorter than its header.";
    return false;
  }
  if (payload[0] != kBinaryPayloadMagic) {
    error = "Native binary ratio payload magic marker did not match.";
    return false;
  }
  if (payload[1] != kBinaryPayloadVersion) {
    error = "Native binary ratio payload version is unsupported.";
    return false;
  }

  int declaredDoubles = 0;
  int nodeCount = 0;
  int connectionCount = 0;
  int inputCount = 0;
  int outputCount = 0;
  int objectiveFlags = 0;
  if (!readNonnegativeInt(payload[2], "totalDoubles", declaredDoubles, error) ||
      !readNonnegativeInt(payload[3], "nodeCount", nodeCount, error) ||
      !readNonnegativeInt(payload[4], "connectionCount", connectionCount, error) ||
      !readNonnegativeInt(payload[5], "inputCount", inputCount, error) ||
      !readNonnegativeInt(payload[6], "outputCount", outputCount, error) ||
      !readNonnegativeInt(payload[8], "objectiveFlags", objectiveFlags, error)) {
    return false;
  }
  if ((objectiveFlags & ~1) != 0) {
    error = "Native binary ratio payload contained unsupported objective flags.";
    return false;
  }
  if (!readNonnegativeInt(payload[7], "tierCount", input.tierCount, error) ||
      input.tierCount < 1 || input.tierCount > kMaxObjectiveTiers) {
    error = "Native binary ratio payload tier count was out of range.";
    return false;
  }
  for (int metricIndex = 0; metricIndex < kMetricCount; ++metricIndex) {
    const int metricOffset = 9 + metricIndex * 5;
    MetricConfig& metric = input.metrics[static_cast<size_t>(metricIndex)];
    int tier = 0;
    metric.enabled = payload[metricOffset] != 0.0;
    if (!readFiniteDouble(payload[metricOffset + 1], "metric.coefficient", metric.coefficient, error) ||
        !readNonnegativeInt(payload[metricOffset + 2], "metric.tier", tier, error) ||
        !readFiniteDouble(payload[metricOffset + 3], "metric.limit", metric.limit, error) ||
        !readFiniteDouble(payload[metricOffset + 4], "metric.outputGoal", metric.outputGoal, error)) {
      return false;
    }
    if (metric.coefficient < 0.0 || tier < 1 || tier > kMaxObjectiveTiers) {
      error = "Native binary ratio payload metric configuration was invalid.";
      return false;
    }
    metric.tier = tier;
  }
  if (declaredDoubles != payloadDoubleCount) {
    error = "Native binary ratio payload length did not match its declared length.";
    return false;
  }

  const int64_t expectedDoubles =
    static_cast<int64_t>(kBinaryPayloadHeaderDoubles) +
    static_cast<int64_t>(nodeCount) * kBinaryPayloadNodeDoubles +
    static_cast<int64_t>(inputCount) * kBinaryPayloadInputDoubles +
    static_cast<int64_t>(outputCount) * kBinaryPayloadOutputDoubles +
    static_cast<int64_t>(connectionCount) * kBinaryPayloadConnectionDoubles;
  if (expectedDoubles != payloadDoubleCount) {
    error = "Native binary ratio payload section sizes did not add up to the payload length.";
    return false;
  }
  const int nodeSectionOffset = kBinaryPayloadHeaderDoubles;
  const int inputSectionOffset = nodeSectionOffset + nodeCount * kBinaryPayloadNodeDoubles;
  const int outputSectionOffset = inputSectionOffset + inputCount * kBinaryPayloadInputDoubles;
  const int connectionSectionOffset = outputSectionOffset + outputCount * kBinaryPayloadOutputDoubles;

  input.nodes.reserve(static_cast<size_t>(nodeCount));
  input.connections.reserve(static_cast<size_t>(connectionCount));

  for (int nodeIndex = 0; nodeIndex < nodeCount; ++nodeIndex) {
    const int base = nodeSectionOffset + nodeIndex * kBinaryPayloadNodeDoubles;
    int inputOffset = 0;
    int nodeInputCount = 0;
    int outputOffset = 0;
    int nodeOutputCount = 0;
    Node node;
    node.id = std::to_string(nodeIndex);
    if (!readFiniteDouble(payload[base], "node.currentMachineCount", node.currentMachineCount, error) ||
        !readFiniteDouble(payload[base + 2], "node.powerUse", node.powerUse, error) ||
        !readFiniteDouble(payload[base + 3], "node.powerOutput", node.powerOutput, error) ||
        !readFiniteDouble(payload[base + 4], "node.pollution", node.pollution, error) ||
        !readFiniteDouble(payload[base + 5], "node.machineCost", node.machineCost, error) ||
        !readFiniteDouble(payload[base + 6], "node.machineSpace", node.machineSpace, error) ||
        !readFiniteDouble(payload[base + 7], "node.modelCount", node.modelCount, error) ||
        !readNonnegativeInt(payload[base + 8], "node.inputOffset", inputOffset, error) ||
        !readNonnegativeInt(payload[base + 9], "node.inputCount", nodeInputCount, error) ||
        !readNonnegativeInt(payload[base + 10], "node.outputOffset", outputOffset, error) ||
        !readNonnegativeInt(payload[base + 11], "node.outputCount", nodeOutputCount, error)) {
      return false;
    }
    if (node.powerUse < 0.0 || node.powerOutput < 0.0 ||
        node.machineCost < 0.0 || node.machineSpace < 0.0 || node.modelCount < 0.0) {
      error = "Native binary ratio payload node objective metrics must be nonnegative.";
      return false;
    }
    node.isTarget = payload[base + 1] != 0.0;
    node.hasInfiniteMachineCost = payload[base + 12] != 0.0;
    if (inputOffset > inputCount || nodeInputCount > inputCount - inputOffset ||
        outputOffset > outputCount || nodeOutputCount > outputCount - outputOffset) {
      error = "Native binary ratio payload node port section was out of range.";
      return false;
    }

    node.inputs.reserve(static_cast<size_t>(nodeInputCount));
    for (int inputIndex = 0; inputIndex < nodeInputCount; ++inputIndex) {
      const int inputBase =
        inputSectionOffset + (inputOffset + inputIndex) * kBinaryPayloadInputDoubles;
      InputPort port;
      if (!readFiniteDouble(payload[inputBase], "input.quantity", port.quantity, error)) {
        return false;
      }
      port.isSink = payload[inputBase + 1] != 0.0;
      node.inputs.push_back(port);
    }

    node.outputs.reserve(static_cast<size_t>(nodeOutputCount));
    for (int outputIndex = 0; outputIndex < nodeOutputCount; ++outputIndex) {
      const int outputBase =
        outputSectionOffset + (outputOffset + outputIndex) * kBinaryPayloadOutputDoubles;
      OutputPort port;
      if (!readFiniteDouble(payload[outputBase], "output.quantity", port.quantity, error)) {
        return false;
      }
      port.hasSinkConnection = payload[outputBase + 1] != 0.0;
      node.outputs.push_back(port);
    }

    input.nodes.push_back(std::move(node));
  }

  for (int connectionIndex = 0; connectionIndex < connectionCount; ++connectionIndex) {
    const int base = connectionSectionOffset + connectionIndex * kBinaryPayloadConnectionDoubles;
    Connection connection;
    connection.id = std::to_string(connectionIndex);
    if (!readNonnegativeInt(payload[base], "connection.sourceNode", connection.sourceNode, error) ||
        !readNonnegativeInt(payload[base + 1], "connection.sourceOutputIndex", connection.sourceOutputIndex, error) ||
        !readNonnegativeInt(payload[base + 2], "connection.targetNode", connection.targetNode, error) ||
        !readNonnegativeInt(payload[base + 3], "connection.targetInputIndex", connection.targetInputIndex, error)) {
      return false;
    }
    if (connection.sourceNode >= static_cast<int>(input.nodes.size()) ||
        connection.targetNode >= static_cast<int>(input.nodes.size())) {
      error = "Native binary ratio payload connection referenced an invalid node index.";
      return false;
    }

    const Node& source = input.nodes[static_cast<size_t>(connection.sourceNode)];
    const Node& target = input.nodes[static_cast<size_t>(connection.targetNode)];
    if (connection.sourceOutputIndex >= static_cast<int>(source.outputs.size()) ||
        connection.targetInputIndex >= static_cast<int>(target.inputs.size())) {
      error = "Native binary ratio payload connection referenced an invalid port index.";
      return false;
    }

    input.connections.push_back(std::move(connection));
  }

  return true;
}

double getTargetMachineLowerBound(const Node& node) {
  if (!node.isTarget) return -1.0;
  if (!std::isfinite(node.currentMachineCount)) return 0.0;
  return std::max(0.0, node.currentMachineCount);
}

struct GraphComponentInfo {
  std::vector<bool> noTargetNodes;
  std::vector<double> valueScales;
  double maxValueScale = 1.0;
};

GraphComponentInfo analyzeGraphComponents(const NativeInput& input) {
  const MetricConfig& powerOutput = input.metrics[PowerOutput];
  const bool preservePowerOutputComponents =
    powerOutput.limit >= 0.0 ||
    (powerOutput.enabled && powerOutput.coefficient > 0.0 && powerOutput.outputGoal >= 0.0);
  std::vector<std::vector<int>> adjacency(input.nodes.size());
  for (const Connection& connection : input.connections) {
    if (connection.sourceNode < 0 ||
        connection.sourceNode >= static_cast<int>(input.nodes.size()) ||
        connection.targetNode < 0 ||
        connection.targetNode >= static_cast<int>(input.nodes.size())) {
      continue;
    }
    adjacency[static_cast<size_t>(connection.sourceNode)].push_back(connection.targetNode);
    adjacency[static_cast<size_t>(connection.targetNode)].push_back(connection.sourceNode);
  }

  std::vector<bool> visited(input.nodes.size(), false);
  GraphComponentInfo result{
    std::vector<bool>(input.nodes.size(), false),
    std::vector<double>(input.nodes.size(), 1.0),
  };
  std::vector<int> stack;
  std::vector<int> component;

  for (int start = 0; start < static_cast<int>(input.nodes.size()); ++start) {
    if (visited[static_cast<size_t>(start)]) continue;

    bool hasTarget = false;
    bool hasPowerOutput = false;
    double maxTargetMachineCount = 0.0;
    stack.clear();
    component.clear();
    stack.push_back(start);
    visited[static_cast<size_t>(start)] = true;

    while (!stack.empty()) {
      const int nodeIndex = stack.back();
      stack.pop_back();
      component.push_back(nodeIndex);
      const Node& node = input.nodes[static_cast<size_t>(nodeIndex)];
      hasTarget = hasTarget || node.isTarget;
      hasPowerOutput = hasPowerOutput ||
        node.powerOutput > 0.0;
      maxTargetMachineCount = std::max(
        maxTargetMachineCount,
        std::max(0.0, getTargetMachineLowerBound(node))
      );

      for (int nextNodeIndex : adjacency[static_cast<size_t>(nodeIndex)]) {
        if (visited[static_cast<size_t>(nextNodeIndex)]) continue;
        visited[static_cast<size_t>(nextNodeIndex)] = true;
        stack.push_back(nextNodeIndex);
      }
    }

    const bool removeComponent = !hasTarget && !(preservePowerOutputComponents && hasPowerOutput);
    const double valueScale = std::max(1.0, maxTargetMachineCount / kTargetMachineBoundCap);
    result.maxValueScale = std::max(result.maxValueScale, valueScale);
    for (int nodeIndex : component) {
      result.noTargetNodes[static_cast<size_t>(nodeIndex)] = removeComponent;
      result.valueScales[static_cast<size_t>(nodeIndex)] = valueScale;
    }
  }

  return result;
}

double getStageBoundRhs(const ModelSpec& model, double value) {
  const double normalizedValue = std::max(0.0, value);
  if (normalizedValue == 0.0) return 0.0;
  const double roundoffFactor = std::numeric_limits<double>::epsilon() *
    static_cast<double>(std::max<size_t>(64, model.vars.size() * 4));
  return normalizedValue + std::max(
    kStageBoundAbsoluteTolerance,
    std::abs(normalizedValue) * roundoffFactor
  );
}

bool isEffectivelyZeroRate(double value) {
  return std::isfinite(value) && std::abs(value) <= kZeroRateConnectionEpsilon;
}

void recordPositiveMagnitude(double value, double& minValue, double& maxValue, bool& hasValue) {
  if (!std::isfinite(value)) return;
  const double magnitude = std::abs(value);
  if (magnitude <= 0.0) return;
  if (!hasValue) {
    minValue = magnitude;
    maxValue = magnitude;
    hasValue = true;
    return;
  }
  minValue = std::min(minValue, magnitude);
  maxValue = std::max(maxValue, magnitude);
}

void recordObjectiveCoeffStats(const VariableSpec& var, double& minValue, double& maxValue, bool& hasValue) {
  recordPositiveMagnitude(var.shortageCoeff, minValue, maxValue, hasValue);
  recordPositiveMagnitude(var.sinkExcessCoeff, minValue, maxValue, hasValue);
  recordPositiveMagnitude(var.infiniteMachineCostUsageCoeff, minValue, maxValue, hasValue);
  recordPositiveMagnitude(var.machineCountCoeff, minValue, maxValue, hasValue);
  for (double coefficient : var.tierCoeff) {
    recordPositiveMagnitude(coefficient, minValue, maxValue, hasValue);
  }
}

ModelStats collectModelStats(const ModelSpec& model) {
  ModelStats stats;
  bool hasCoefficient = false;
  bool hasBound = false;

  for (const VariableSpec& var : model.vars) {
    recordObjectiveCoeffStats(var, stats.minCoefficient, stats.maxCoefficient, hasCoefficient);
    recordPositiveMagnitude(var.lb, stats.minFiniteBound, stats.maxFiniteBound, hasBound);
    recordPositiveMagnitude(var.ub, stats.minFiniteBound, stats.maxFiniteBound, hasBound);
  }

  for (const RowSpec& row : model.rows) {
    recordPositiveMagnitude(row.lhs, stats.minFiniteBound, stats.maxFiniteBound, hasBound);
    recordPositiveMagnitude(row.rhs, stats.minFiniteBound, stats.maxFiniteBound, hasBound);
    for (const TermSpec& term : row.terms) {
      if (term.coeff != 0.0) {
        ++stats.nonzeroCount;
      }
      recordPositiveMagnitude(term.coeff, stats.minCoefficient, stats.maxCoefficient, hasCoefficient);
    }
  }

  if (!hasCoefficient) {
    stats.minCoefficient = 0.0;
    stats.maxCoefficient = 0.0;
  }
  if (!hasBound) {
    stats.minFiniteBound = 0.0;
    stats.maxFiniteBound = 0.0;
  }

  return stats;
}

bool validateNativeInput(const NativeInput& input, std::string& error) {
  for (const MetricConfig& metric : input.metrics) {
    if (!std::isfinite(metric.coefficient) || metric.coefficient < 0.0 ||
        metric.tier < 1 || metric.tier > kMaxObjectiveTiers ||
        !std::isfinite(metric.limit) || !std::isfinite(metric.outputGoal)) {
      error = "Native ratio metric configuration was invalid.";
      return false;
    }
  }

  for (const Node& node : input.nodes) {
    const double nonnegativeMetrics[] = {
      node.currentMachineCount,
      node.powerUse,
      node.powerOutput,
      node.machineCost,
      node.machineSpace,
      node.modelCount,
    };
    for (double metric : nonnegativeMetrics) {
      if (!std::isfinite(metric) || metric < 0.0) {
        error = "Native ratio node values must be finite and nonnegative.";
        return false;
      }
    }
    if (!std::isfinite(node.pollution)) {
      error = "Native ratio pollution must be finite.";
      return false;
    }
    for (const InputPort& port : node.inputs) {
      if (!std::isfinite(port.quantity) || port.quantity < 0.0) {
        error = "Native ratio input rates must be finite and nonnegative.";
        return false;
      }
    }
    for (const OutputPort& port : node.outputs) {
      if (!std::isfinite(port.quantity) || port.quantity < 0.0) {
        error = "Native ratio output rates must be finite and nonnegative.";
        return false;
      }
    }
  }
  return true;
}

bool validateModelDefinition(const ModelSpec& model, std::string& error) {
  if (!std::isfinite(model.valueScale) || model.valueScale <= 0.0) {
    error = "Native ratio model scaling was not finite and positive.";
    return false;
  }

  for (const VariableSpec& var : model.vars) {
    const bool invalidBounds = std::isnan(var.lb) || std::isnan(var.ub) ||
      (std::isinf(var.lb) && var.lb > 0.0) ||
      (std::isinf(var.ub) && var.ub < 0.0) ||
      var.lb > var.ub || !std::isfinite(var.physicalScale) || var.physicalScale <= 0.0;
    const double coefficients[] = {
      var.shortageCoeff,
      var.sinkExcessCoeff,
      var.infiniteMachineCostUsageCoeff,
      var.machineCountCoeff,
    };
    if (invalidBounds) {
      error = "Native ratio model produced invalid variable bounds for " + var.name + ".";
      return false;
    }
    for (double coefficient : coefficients) {
      if (!std::isfinite(coefficient) || coefficient < 0.0) {
        error = "Native ratio model produced an invalid objective coefficient for " + var.name + ".";
        return false;
      }
    }
    for (double coefficient : var.tierCoeff) {
      if (!std::isfinite(coefficient) || coefficient < 0.0) {
        error = "Native ratio model produced an invalid tier coefficient for " + var.name + ".";
        return false;
      }
    }
  }

  for (const RowSpec& row : model.rows) {
    if (std::isnan(row.lhs) || std::isnan(row.rhs) ||
        (std::isinf(row.lhs) && row.lhs > 0.0) ||
        (std::isinf(row.rhs) && row.rhs < 0.0) ||
        row.lhs > row.rhs) {
      error = "Native ratio model produced invalid row bounds for " + row.name + ".";
      return false;
    }
    for (const TermSpec& term : row.terms) {
      if (!std::isfinite(term.coeff)) {
        error = "Native ratio model produced a non-finite coefficient in " + row.name + ".";
        return false;
      }
    }
  }
  return true;
}

int addVariable(ModelSpec& model, VariableSpec var) {
  const int index = static_cast<int>(model.vars.size());
  model.vars.push_back(std::move(var));
  return index;
}

void addRowTerm(RowSpec& row, int varIndex, double coeff) {
  if (varIndex < 0 || coeff == 0.0) return;
  row.terms.push_back({ varIndex, coeff });
}

RowSpec makeExpressionBoundRow(
  const ModelSpec& model,
  const std::string& name,
  ObjectiveMode objective,
  double optimum
) {
  RowSpec row;
  row.name = "limit_" + name;
  row.lhs = -std::numeric_limits<double>::infinity();
  row.rhs = getStageBoundRhs(model, optimum);
  row.terms.reserve(model.vars.size());

  for (int i = 0; i < static_cast<int>(model.vars.size()); ++i) {
    const VariableSpec& var = model.vars[static_cast<size_t>(i)];
    double coeff = 0.0;
    switch (objective) {
      case ObjectiveMode::Shortage:
        coeff = var.shortageCoeff;
        break;
      case ObjectiveMode::SinkExcess:
        coeff = var.sinkExcessCoeff;
        break;
      case ObjectiveMode::InfiniteMachineCostUsage:
        coeff = var.infiniteMachineCostUsageCoeff;
        break;
      case ObjectiveMode::Tier1:
      case ObjectiveMode::Tier2:
      case ObjectiveMode::Tier3:
        coeff = var.tierCoeff[static_cast<size_t>(getTierIndex(objective))];
        break;
      case ObjectiveMode::MachineCount:
        coeff = var.machineCountCoeff;
        break;
    }
    addRowTerm(row, i, coeff);
  }

  return row;
}

double getObjectiveCoeff(const VariableSpec& var, ObjectiveMode objective) {
  switch (objective) {
    case ObjectiveMode::Shortage:
      return var.shortageCoeff;
    case ObjectiveMode::SinkExcess:
      return var.sinkExcessCoeff;
    case ObjectiveMode::InfiniteMachineCostUsage:
      return var.infiniteMachineCostUsageCoeff;
    case ObjectiveMode::Tier1:
    case ObjectiveMode::Tier2:
    case ObjectiveMode::Tier3:
      return var.tierCoeff[static_cast<size_t>(getTierIndex(objective))];
    case ObjectiveMode::MachineCount:
      return var.machineCountCoeff;
  }
  return 0.0;
}

double getValidationTolerance(double activity, double bound) {
  const double scale = std::max(std::abs(activity), std::abs(bound));
  return std::max(kValidationAbsoluteTolerance, scale * kValidationRelativeTolerance);
}

double ceilMachineCount(double value) {
  if (!std::isfinite(value) || value <= 0.0) return 0.0;
  const double nearestInteger = std::round(value);
  const double tolerance =
    kIntegralityTolerance + std::abs(value) * kMachineIntegerRelativeTolerance;
  return std::abs(value - nearestInteger) <= tolerance
    ? nearestInteger
    : std::ceil(value);
}

void tightenUpperBound(VariableSpec& var, double upperBound) {
  if (!std::isfinite(upperBound) || upperBound < 0.0) return;
  var.ub = std::min(var.ub, upperBound);
  if (std::isfinite(var.lb) && var.ub < var.lb) {
    const double tolerance = getValidationTolerance(var.ub, var.lb);
    if (var.lb - var.ub <= tolerance) {
      var.ub = var.lb;
    }
  }
}

void tightenObjectiveVariableBounds(
  ModelSpec& model,
  ObjectiveMode objective,
  double optimum
) {
  if (!std::isfinite(optimum)) return;
  const double rhs = getStageBoundRhs(model, optimum);
  for (VariableSpec& var : model.vars) {
    const double coeff = getObjectiveCoeff(var, objective);
    if (coeff <= 0.0) continue;
    tightenUpperBound(var, rhs / coeff);
  }
}

bool isFiniteOrInfinity(double value) {
  return std::isfinite(value) || std::isinf(value);
}

std::string describeObjective(ObjectiveMode objective) {
  switch (objective) {
    case ObjectiveMode::Shortage:
      return "shortage";
    case ObjectiveMode::SinkExcess:
      return "sink excess";
    case ObjectiveMode::InfiniteMachineCostUsage:
      return "infinite machine cost usage";
    case ObjectiveMode::Tier1:
      return "tier 1";
    case ObjectiveMode::Tier2:
      return "tier 2";
    case ObjectiveMode::Tier3:
      return "tier 3";
    case ObjectiveMode::MachineCount:
      return "machine count";
  }
  return "unknown";
}

bool validateStageSolution(
  const ModelSpec& model,
  ObjectiveMode objective,
  const std::vector<double>& values,
  double objectiveValue,
  std::string& error
) {
  if (values.size() != model.vars.size()) {
    error = "Native validation failed because the solution vector length did not match the model.";
    return false;
  }

  if (!std::isfinite(objectiveValue)) {
    error = "Native validation failed because the objective value was not finite.";
    return false;
  }

  double recomputedObjective = 0.0;
  for (int i = 0; i < static_cast<int>(model.vars.size()); ++i) {
    const VariableSpec& var = model.vars[static_cast<size_t>(i)];
    const double value = values[static_cast<size_t>(i)];
    if (!std::isfinite(value)) {
      error = "Native validation failed because variable " + var.name + " was not finite.";
      return false;
    }

    if (var.kind != VariableKind::Continuous) {
      const double nearestInteger = std::round(value);
      if (std::abs(value - nearestInteger) > kIntegralityTolerance) {
        std::ostringstream out;
        out << std::setprecision(17)
            << "Native validation failed: integer variable " << var.name
            << " had fractional value " << value << ".";
        error = out.str();
        return false;
      }
    }

    if (std::isfinite(var.lb)) {
      const double tolerance = getValidationTolerance(value, var.lb);
      if (value + tolerance < var.lb) {
        std::ostringstream out;
        out << std::setprecision(17)
            << "Native validation failed: variable " << var.name
            << " value " << value
            << " is below lower bound " << var.lb
            << " by " << (var.lb - value) << ".";
        error = out.str();
        return false;
      }
    }

    if (std::isfinite(var.ub)) {
      const double tolerance = getValidationTolerance(value, var.ub);
      if (value - tolerance > var.ub) {
        std::ostringstream out;
        out << std::setprecision(17)
            << "Native validation failed: variable " << var.name
            << " value " << value
            << " is above upper bound " << var.ub
            << " by " << (value - var.ub) << ".";
        error = out.str();
        return false;
      }
    }

    recomputedObjective += getObjectiveCoeff(var, objective) * value;
  }

  if (!std::isfinite(recomputedObjective)) {
    error = "Native validation failed because the recomputed objective was not finite.";
    return false;
  }

  const double objectiveTolerance = getValidationTolerance(recomputedObjective, objectiveValue);
  if (std::abs(recomputedObjective - objectiveValue) > objectiveTolerance) {
    std::ostringstream out;
    out << std::setprecision(17)
        << "Native validation failed: " << describeObjective(objective)
        << " objective was reported as " << objectiveValue
        << " but recomputed as " << recomputedObjective << ".";
    error = out.str();
    return false;
  }

  for (const RowSpec& row : model.rows) {
    if (!isFiniteOrInfinity(row.lhs) || !isFiniteOrInfinity(row.rhs)) {
      error = "Native validation failed because row " + row.name + " had an invalid bound.";
      return false;
    }

    long double activityAccumulator = 0.0;
    for (const TermSpec& term : row.terms) {
      if (term.varIndex < 0 || term.varIndex >= static_cast<int>(values.size())) {
        error = "Native validation failed because row " + row.name + " referenced an invalid variable.";
        return false;
      }
      if (!std::isfinite(term.coeff)) {
        error = "Native validation failed because row " + row.name + " had a non-finite coefficient.";
        return false;
      }
      activityAccumulator += static_cast<long double>(term.coeff) *
        static_cast<long double>(values[static_cast<size_t>(term.varIndex)]);
    }

    const double activity = static_cast<double>(activityAccumulator);
    if (!std::isfinite(activity)) {
      error = "Native validation failed because row " + row.name + " had non-finite activity.";
      return false;
    }

    if (std::isfinite(row.lhs)) {
      const double tolerance = getValidationTolerance(activity, row.lhs);
      if (activity + tolerance < row.lhs) {
        std::ostringstream out;
        out << std::setprecision(17)
            << "Native validation failed: row " << row.name
            << " activity " << activity
            << " is below lhs " << row.lhs
            << " by " << (row.lhs - activity) << ".";
        error = out.str();
        return false;
      }
    }

    if (std::isfinite(row.rhs)) {
      const double tolerance = getValidationTolerance(activity, row.rhs);
      if (activity - tolerance > row.rhs) {
        std::ostringstream out;
        out << std::setprecision(17)
            << "Native validation failed: row " << row.name
            << " activity " << activity
            << " is above rhs " << row.rhs
            << " by " << (activity - row.rhs) << ".";
        error = out.str();
        return false;
      }
    }
  }

  return true;
}

ModelSpec buildModelSpec(const NativeInput& input) {
  ModelSpec model;
  const GraphComponentInfo componentInfo = analyzeGraphComponents(input);
  model.tierCount = input.tierCount;
  model.valueScale = componentInfo.maxValueScale;
  model.machineVarByNode.assign(input.nodes.size(), -1);
  model.edgeVarByConnection.assign(input.connections.size(), -1);
  model.deficitVarByNodeInput.resize(input.nodes.size());
  model.roundedVarByNode.assign(input.nodes.size(), -1);
  model.roundedTierCoeffByNode.assign(input.nodes.size(), {});
  model.roundedMetricValueByNode.assign(input.nodes.size(), {});
  model.roundedMetricLimits = {{
    input.metrics[MachineCost].limit,
    input.metrics[MachineSpace].limit,
    input.metrics[ModelCount].limit,
  }};
  const MetricConfig& machineCostConfig = input.metrics[MachineCost];
  if (machineCostConfig.enabled && machineCostConfig.coefficient > 0.0) {
    model.infiniteMachineCostTier = machineCostConfig.tier;
  }
  model.hasRoundedObjective = std::any_of(
    model.roundedMetricLimits.begin(), model.roundedMetricLimits.end(),
    [](double value) { return value >= 0.0; });
  const std::vector<bool>& noTargetComponentNodes = componentInfo.noTargetNodes;

  size_t totalInputs = 0;
  size_t totalOutputs = 0;
  for (const Node& node : input.nodes) {
    totalInputs += node.inputs.size();
    totalOutputs += node.outputs.size();
  }
  model.vars.reserve(input.nodes.size() + input.connections.size() + totalInputs + totalOutputs);
  model.rows.reserve(totalInputs + totalOutputs + 3);

  std::vector<std::vector<std::vector<int>>> outgoingByOutput(input.nodes.size());
  std::vector<std::vector<std::vector<int>>> incomingByInput(input.nodes.size());
  for (int nodeIndex = 0; nodeIndex < static_cast<int>(input.nodes.size()); ++nodeIndex) {
    outgoingByOutput[static_cast<size_t>(nodeIndex)].resize(input.nodes[static_cast<size_t>(nodeIndex)].outputs.size());
    incomingByInput[static_cast<size_t>(nodeIndex)].resize(input.nodes[static_cast<size_t>(nodeIndex)].inputs.size());
    model.deficitVarByNodeInput[static_cast<size_t>(nodeIndex)]
      .assign(input.nodes[static_cast<size_t>(nodeIndex)].inputs.size(), -1);
  }

  for (int connectionIndex = 0; connectionIndex < static_cast<int>(input.connections.size()); ++connectionIndex) {
    const Connection& connection = input.connections[static_cast<size_t>(connectionIndex)];
    outgoingByOutput[static_cast<size_t>(connection.sourceNode)]
      [static_cast<size_t>(connection.sourceOutputIndex)]
      .push_back(connectionIndex);
    incomingByInput[static_cast<size_t>(connection.targetNode)]
      [static_cast<size_t>(connection.targetInputIndex)]
      .push_back(connectionIndex);
  }

  for (int nodeIndex = 0; nodeIndex < static_cast<int>(input.nodes.size()); ++nodeIndex) {
    const Node& node = input.nodes[static_cast<size_t>(nodeIndex)];
    const double valueScale = componentInfo.valueScales[static_cast<size_t>(nodeIndex)];
    model.roundedMetricValueByNode[static_cast<size_t>(nodeIndex)] = {{
      node.machineCost, node.machineSpace, node.modelCount,
    }};
    VariableSpec var;
    var.name = "m_" + node.id;
    var.lb = 0.0;
    var.ub = std::numeric_limits<double>::infinity();
    var.physicalScale = valueScale;

    const double targetMachineLowerBound = getTargetMachineLowerBound(node);
    if (targetMachineLowerBound >= 0.0) {
      var.lb = targetMachineLowerBound / valueScale;
    }
    // Targetless components are zero-bounded only when they cannot contribute to
    // the configured power-output goal or minimum.
    if (noTargetComponentNodes[static_cast<size_t>(nodeIndex)]) {
      var.ub = 0.0;
    }

    for (int tierIndex = 0; tierIndex < kMaxObjectiveTiers; ++tierIndex) {
      double continuousWeight = 0.0;
      double roundedWeight = 0.0;
      const auto addContinuous = [&](MetricIndex metric, double value) {
        const MetricConfig& config = input.metrics[static_cast<size_t>(metric)];
        if (config.enabled && config.tier == tierIndex + 1) continuousWeight += config.coefficient * value;
      };
      const auto addRounded = [&](MetricIndex metric, double value) {
        const MetricConfig& config = input.metrics[static_cast<size_t>(metric)];
        if (config.enabled && config.tier == tierIndex + 1) roundedWeight += config.coefficient * value;
      };
      addContinuous(PowerUse, node.powerUse);
      addRounded(MachineCost, node.machineCost);
      addRounded(MachineSpace, node.machineSpace);
      addRounded(ModelCount, node.modelCount);
      var.continuousTierCoeff[static_cast<size_t>(tierIndex)] = continuousWeight * valueScale;
      var.tierCoeff[static_cast<size_t>(tierIndex)] = (continuousWeight + roundedWeight) * valueScale;
      model.roundedTierCoeffByNode[static_cast<size_t>(nodeIndex)][static_cast<size_t>(tierIndex)] = roundedWeight;
      model.hasRoundedObjective = model.hasRoundedObjective || roundedWeight > 0.0;
    }
    if (node.hasInfiniteMachineCost) {
      var.infiniteMachineCostUsageCoeff = valueScale;
    }
    var.machineCountCoeff = valueScale;
    model.machineVarByNode[static_cast<size_t>(nodeIndex)] = addVariable(model, std::move(var));
  }

  const MetricConfig& outputConfig = input.metrics[PowerOutput];
  if (outputConfig.enabled && outputConfig.outputGoal >= 0.0) {
    VariableSpec shortfall;
    shortfall.name = "power_output_shortfall";
    shortfall.lb = 0.0;
    shortfall.ub = outputConfig.outputGoal;
    shortfall.tierCoeff[static_cast<size_t>(outputConfig.tier - 1)] = outputConfig.coefficient;
    const int shortfallIndex = addVariable(model, std::move(shortfall));
    RowSpec row;
    row.name = "power_output_goal";
    row.lhs = outputConfig.outputGoal;
    row.rhs = std::numeric_limits<double>::infinity();
    addRowTerm(row, shortfallIndex, 1.0);
    for (int nodeIndex = 0; nodeIndex < static_cast<int>(input.nodes.size()); ++nodeIndex) {
      addRowTerm(row, model.machineVarByNode[static_cast<size_t>(nodeIndex)],
        input.nodes[static_cast<size_t>(nodeIndex)].powerOutput *
          componentInfo.valueScales[static_cast<size_t>(nodeIndex)]);
    }
    model.rows.push_back(std::move(row));
  }

  const MetricConfig& pollutionConfig = input.metrics[Pollution];
  if (pollutionConfig.enabled) {
    VariableSpec burden;
    burden.name = "pollution_burden";
    burden.lb = 0.0;
    burden.ub = std::numeric_limits<double>::infinity();
    burden.tierCoeff[static_cast<size_t>(pollutionConfig.tier - 1)] = pollutionConfig.coefficient;
    const int burdenIndex = addVariable(model, std::move(burden));
    RowSpec row;
    row.name = "pollution_burden_definition";
    row.lhs = 0.0;
    row.rhs = std::numeric_limits<double>::infinity();
    addRowTerm(row, burdenIndex, 1.0);
    for (int nodeIndex = 0; nodeIndex < static_cast<int>(input.nodes.size()); ++nodeIndex) {
      addRowTerm(row, model.machineVarByNode[static_cast<size_t>(nodeIndex)],
        -input.nodes[static_cast<size_t>(nodeIndex)].pollution *
          componentInfo.valueScales[static_cast<size_t>(nodeIndex)]);
    }
    model.rows.push_back(std::move(row));
  }

  const auto addContinuousLimit = [&](MetricIndex metricIndex, const std::string& name, bool minimum) {
    const MetricConfig& config = input.metrics[static_cast<size_t>(metricIndex)];
    if (config.limit < 0.0) return;
    RowSpec row;
    row.name = "user_limit_" + name;
    row.lhs = minimum ? config.limit : -std::numeric_limits<double>::infinity();
    row.rhs = minimum ? std::numeric_limits<double>::infinity() : config.limit;
    for (int nodeIndex = 0; nodeIndex < static_cast<int>(input.nodes.size()); ++nodeIndex) {
      const Node& node = input.nodes[static_cast<size_t>(nodeIndex)];
      double value = 0.0;
      if (metricIndex == PowerUse) value = node.powerUse;
      if (metricIndex == PowerOutput) value = node.powerOutput;
      if (metricIndex == Pollution) value = node.pollution;
      addRowTerm(
        row,
        model.machineVarByNode[static_cast<size_t>(nodeIndex)],
        value * componentInfo.valueScales[static_cast<size_t>(nodeIndex)]
      );
    }
    model.deferredLimitRows.push_back(std::move(row));
  };
  addContinuousLimit(PowerUse, "power_use", false);
  addContinuousLimit(PowerOutput, "power_output", true);
  addContinuousLimit(Pollution, "pollution", false);

  if (input.metrics[MachineCost].limit >= 0.0) {
    RowSpec row;
    row.name = "user_limit_infinite_machine_cost";
    row.lhs = -std::numeric_limits<double>::infinity();
    row.rhs = 0.0;
    for (int nodeIndex = 0; nodeIndex < static_cast<int>(input.nodes.size()); ++nodeIndex) {
      if (!input.nodes[static_cast<size_t>(nodeIndex)].hasInfiniteMachineCost) continue;
      addRowTerm(
        row,
        model.machineVarByNode[static_cast<size_t>(nodeIndex)],
        componentInfo.valueScales[static_cast<size_t>(nodeIndex)]
      );
    }
    if (!row.terms.empty()) model.deferredLimitRows.push_back(std::move(row));
  }

  for (int connectionIndex = 0; connectionIndex < static_cast<int>(input.connections.size()); ++connectionIndex) {
    VariableSpec var;
    var.name = "f_" + input.connections[static_cast<size_t>(connectionIndex)].id;
    var.lb = 0.0;
    var.ub = std::numeric_limits<double>::infinity();
    const Connection& connection = input.connections[static_cast<size_t>(connectionIndex)];
    var.physicalScale = componentInfo.valueScales[static_cast<size_t>(connection.sourceNode)];
    if (
      noTargetComponentNodes[static_cast<size_t>(connection.sourceNode)] ||
      noTargetComponentNodes[static_cast<size_t>(connection.targetNode)]
    ) {
      var.ub = 0.0;
    }
    const Node& sourceNode = input.nodes[static_cast<size_t>(connection.sourceNode)];
    const Node& targetNode = input.nodes[static_cast<size_t>(connection.targetNode)];
    const OutputPort& sourceOutput = sourceNode.outputs[static_cast<size_t>(connection.sourceOutputIndex)];
    const InputPort& targetInput = targetNode.inputs[static_cast<size_t>(connection.targetInputIndex)];
    if (isEffectivelyZeroRate(sourceOutput.quantity) || isEffectivelyZeroRate(targetInput.quantity)) {
      var.ub = 0.0;
    }
    model.edgeVarByConnection[static_cast<size_t>(connectionIndex)] = addVariable(model, std::move(var));
  }

  for (int nodeIndex = 0; nodeIndex < static_cast<int>(input.nodes.size()); ++nodeIndex) {
    const Node& node = input.nodes[static_cast<size_t>(nodeIndex)];
    const double valueScale = componentInfo.valueScales[static_cast<size_t>(nodeIndex)];
    const int machineVar = model.machineVarByNode[static_cast<size_t>(nodeIndex)];

    for (int outputIndex = 0; outputIndex < static_cast<int>(node.outputs.size()); ++outputIndex) {
      const OutputPort& output = node.outputs[static_cast<size_t>(outputIndex)];
      const std::vector<int>& outgoing = outgoingByOutput[static_cast<size_t>(nodeIndex)]
        [static_cast<size_t>(outputIndex)];

      if (outgoing.empty() && !output.hasSinkConnection) continue;

      VariableSpec excessVar;
      excessVar.name = "excess_" + node.id + "_" + std::to_string(outputIndex);
      excessVar.lb = 0.0;
      excessVar.ub = std::numeric_limits<double>::infinity();
      excessVar.physicalScale = valueScale;
      if (noTargetComponentNodes[static_cast<size_t>(nodeIndex)]) {
        excessVar.ub = 0.0;
      }
      if (output.hasSinkConnection) {
        excessVar.sinkExcessCoeff = valueScale;
        model.hasSinkExcessObjective = true;
      }
      const int excessVarIndex = addVariable(model, std::move(excessVar));

      RowSpec row;
      row.name = "flow_out_" + node.id + "_" + std::to_string(outputIndex);
      row.lhs = 0.0;
      row.rhs = 0.0;
      row.terms.reserve(outgoing.size() + 2);
      addRowTerm(row, machineVar, output.quantity);
      for (int connectionIndex : outgoing) {
        addRowTerm(row, model.edgeVarByConnection[static_cast<size_t>(connectionIndex)], -1.0);
      }
      addRowTerm(row, excessVarIndex, -1.0);
      model.rows.push_back(std::move(row));
    }
  }

  for (int nodeIndex = 0; nodeIndex < static_cast<int>(input.nodes.size()); ++nodeIndex) {
    const Node& node = input.nodes[static_cast<size_t>(nodeIndex)];
    const double valueScale = componentInfo.valueScales[static_cast<size_t>(nodeIndex)];
    const int machineVar = model.machineVarByNode[static_cast<size_t>(nodeIndex)];

    for (int inputIndex = 0; inputIndex < static_cast<int>(node.inputs.size()); ++inputIndex) {
      const InputPort& inputPort = node.inputs[static_cast<size_t>(inputIndex)];
      const std::vector<int>& incoming = incomingByInput[static_cast<size_t>(nodeIndex)]
        [static_cast<size_t>(inputIndex)];
      if (incoming.empty()) continue;

      if (inputPort.isSink && !node.isTarget) {
        RowSpec row;
        row.name = "sink_cap_" + node.id + "_" + std::to_string(inputIndex);
        row.lhs = -std::numeric_limits<double>::infinity();
        row.rhs = 0.0;
        row.terms.reserve(incoming.size() + 1);
        for (int connectionIndex : incoming) {
          addRowTerm(row, model.edgeVarByConnection[static_cast<size_t>(connectionIndex)], 1.0);
        }
        addRowTerm(row, machineVar, -inputPort.quantity);
        model.rows.push_back(std::move(row));
      } else {
        VariableSpec deficitVar;
        deficitVar.name = "deficit_" + node.id + "_" + std::to_string(inputIndex);
        deficitVar.lb = 0.0;
        deficitVar.ub = std::numeric_limits<double>::infinity();
        deficitVar.physicalScale = valueScale;
        if (noTargetComponentNodes[static_cast<size_t>(nodeIndex)]) {
          deficitVar.ub = 0.0;
        }
        deficitVar.shortageCoeff = valueScale;
        model.hasShortageObjective = true;
        const int deficitVarIndex = addVariable(model, std::move(deficitVar));
        model.deficitVarByNodeInput[static_cast<size_t>(nodeIndex)]
          [static_cast<size_t>(inputIndex)] = deficitVarIndex;

        RowSpec row;
        row.name = "flow_in_" + node.id + "_" + std::to_string(inputIndex);
        row.lhs = 0.0;
        row.rhs = 0.0;
        row.terms.reserve(incoming.size() + 2);
        for (int connectionIndex : incoming) {
          addRowTerm(row, model.edgeVarByConnection[static_cast<size_t>(connectionIndex)], 1.0);
        }
        addRowTerm(row, deficitVarIndex, 1.0);
        addRowTerm(row, machineVar, -inputPort.quantity);
        model.rows.push_back(std::move(row));
      }
    }
  }

  return model;
}

bool checkScip(SCIP_RETCODE retcode, const char* action, std::string& error) {
  if (retcode == SCIP_OKAY) return true;
  std::ostringstream out;
  out << action << " failed with SCIP code " << retcode << ".";
  error = out.str();
  return false;
}

bool setOptionalIntParam(SCIP* scip, const char* name, int value) {
  return SCIPsetIntParam(scip, name, value) == SCIP_OKAY;
}

bool setOptionalRealParam(SCIP* scip, const char* name, double value) {
  return SCIPsetRealParam(scip, name, value) == SCIP_OKAY;
}

bool applySolveOptions(SCIP* scip, const SolveOptions& options, std::string& error) {
  if (!checkScip(SCIPsetIntParam(scip, "display/verblevel", 0), "Set SCIP display verbosity", error)) {
    return false;
  }

  if (options.useNumericsEmphasis) {
    if (!checkScip(SCIPsetEmphasis(scip, SCIP_PARAMEMPHASIS_NUMERICS, TRUE),
                   "Set SCIP numerics emphasis", error)) {
      return false;
    }
  }

  if (options.useFastPresolve) {
    if (!checkScip(
          SCIPsetPresolving(scip, SCIP_PARAMSETTING_FAST, TRUE),
          "Set SCIP fast presolving",
          error
        )) {
      return false;
    }
  }

  if (options.disableSymmetry) {
    if (!checkScip(
          SCIPsetIntParam(scip, "misc/usesymmetry", 0),
          "Disable SCIP symmetry handling",
          error
        )) {
      return false;
    }
  }

  if (options.disableMilpPresolver) {
    setOptionalIntParam(scip, "presolving/milp/maxrounds", 0);
  }

  setOptionalRealParam(scip, "numerics/feastol", 1e-8);

  return true;
}

double toScipBound(SCIP* scip, double value) {
  const double infinity = SCIPinfinity(scip);
  if (value <= -infinity) return -infinity;
  if (value >= infinity) return infinity;
  return value;
}

double toSoplexBound(double value) {
  if (value <= -soplex::infinity) return -soplex::infinity;
  if (value >= soplex::infinity) return soplex::infinity;
  return value;
}

double recomputeObjectiveValue(
  const ModelSpec& model,
  ObjectiveMode objective,
  const std::vector<double>& values
) {
  long double objectiveValue = 0.0;
  for (int i = 0; i < static_cast<int>(model.vars.size()); ++i) {
    objectiveValue += static_cast<long double>(getObjectiveCoeff(model.vars[static_cast<size_t>(i)], objective)) *
      static_cast<long double>(values[static_cast<size_t>(i)]);
  }

  double value = static_cast<double>(objectiveValue);
  if (value < 0.0 && value > -kStageBoundAbsoluteTolerance) value = 0.0;
  return std::max(0.0, value);
}

bool addScipLinearRow(
  SCIP* scip,
  const std::vector<SCIP_VAR*>& vars,
  const RowSpec& rowSpec,
  std::string& error
) {
  const double lhs = toScipBound(scip, rowSpec.lhs);
  const double rhs = toScipBound(scip, rowSpec.rhs);
  SCIP_CONS* cons = nullptr;
  if (!checkScip(
        SCIPcreateConsBasicLinear(scip, &cons, rowSpec.name.c_str(), 0, nullptr, nullptr, lhs, rhs),
        "Create SCIP linear constraint",
        error
      )) {
    return false;
  }

  bool ok = true;
  for (const TermSpec& term : rowSpec.terms) {
    if (term.varIndex < 0 || term.varIndex >= static_cast<int>(vars.size())) continue;
    if (!checkScip(
          SCIPaddCoefLinear(scip, cons, vars[static_cast<size_t>(term.varIndex)], term.coeff),
          "Add SCIP linear coefficient",
          error
        )) {
      ok = false;
      break;
    }
  }

  if (ok) ok = checkScip(SCIPaddCons(scip, cons), "Add SCIP constraint", error);
  SCIPreleaseCons(scip, &cons);
  return ok;
}

class StagedLpEngine {
 public:
  explicit StagedLpEngine(ModelSpec model, SolveControl* control = nullptr)
    : activeModel_(std::move(model)), control_(control) {}
  virtual ~StagedLpEngine() = default;

  const ModelSpec& model() const { return activeModel_; }
  ModelSpec takeModel() { return std::move(activeModel_); }
  void reportStage(int stageCode) { setSolveStage(control_, stageCode); }
  bool isCancelled() const { return isCancellationRequested(control_); }
  virtual std::string profileName() const = 0;
  virtual bool initialize(std::string& error) = 0;
  virtual bool solveStage(
    ObjectiveMode objective,
    bool captureValues,
    StageSolution& solution,
    std::string& error
  ) = 0;
  virtual void collectTelemetry(SolveTelemetry& telemetry) const {
    (void)telemetry;
  }

  bool addObjectiveBoundRow(
    const std::string& name,
    ObjectiveMode objective,
    double optimum,
    std::string& error
  ) {
    RowSpec row = makeExpressionBoundRow(activeModel_, name, objective, optimum);
    if (row.terms.empty()) return true;
    if (!addBackendRow(row, error)) return false;
    activeModel_.rows.push_back(std::move(row));
    return true;
  }

  bool activateDeferredLimits(std::string& error) {
    for (const RowSpec& row : activeModel_.deferredLimitRows) {
      if (!addBackendRow(row, error)) return false;
      activeModel_.rows.push_back(row);
    }
    activeModel_.deferredLimitRows.clear();
    return true;
  }

  bool tightenObjectiveVariableBounds(
    ObjectiveMode objective,
    double optimum,
    std::string& error
  ) {
    if (!std::isfinite(optimum)) return true;
    const double rhs = getStageBoundRhs(activeModel_, optimum);
    for (int i = 0; i < static_cast<int>(activeModel_.vars.size()); ++i) {
      VariableSpec& var = activeModel_.vars[static_cast<size_t>(i)];
      const double coeff = getObjectiveCoeff(var, objective);
      if (coeff <= 0.0) continue;

      const double oldUb = var.ub;
      // Safe after a solved priority stage: for coeff > 0 and expr <= rhs,
      // each nonnegative variable is individually bounded by rhs / coeff.
      tightenUpperBound(var, rhs / coeff);
      if (oldUb == var.ub) continue;
      if (!changeBackendBounds(i, var, error)) return false;
    }
    return true;
  }

  bool fixObjectiveVariablesToZero(
    ObjectiveMode objective,
    std::string& error
  ) {
    for (int i = 0; i < static_cast<int>(activeModel_.vars.size()); ++i) {
      VariableSpec& var = activeModel_.vars[static_cast<size_t>(i)];
      if (getObjectiveCoeff(var, objective) <= 0.0) continue;
      if (var.lb > 0.0) {
        error = "Cannot exclude infinite-cost machine " + var.name +
          " because its proven lower bound is positive.";
        return false;
      }
      if (var.ub == 0.0) continue;
      var.ub = 0.0;
      if (!changeBackendBounds(i, var, error)) return false;
    }
    return true;
  }

 protected:
  virtual bool addBackendRow(const RowSpec& row, std::string& error) = 0;
  virtual bool changeBackendBounds(int varIndex, const VariableSpec& var, std::string& error) = 0;

  ModelSpec activeModel_;
  SolveControl* control_ = nullptr;
};

class SoplexStagedLpEngine final : public StagedLpEngine {
 public:
  explicit SoplexStagedLpEngine(ModelSpec model, SolveControl* control = nullptr)
    : StagedLpEngine(std::move(model), control) {}

  std::string profileName() const override { return "soplex_direct"; }

  void collectTelemetry(SolveTelemetry& telemetry) const override {
    telemetry.lpIterations += totalLpIterations_;
  }

  bool initialize(std::string& error) override {
    try {
      solver_.setIntParam(soplex::SoPlex::OBJSENSE, soplex::SoPlex::OBJSENSE_MINIMIZE);
      solver_.setIntParam(soplex::SoPlex::VERBOSITY, soplex::SoPlex::VERBOSITY_ERROR);

      for (const VariableSpec& var : activeModel_.vars) {
        const soplex::DSVector emptyColumn(0);
        solver_.addColReal(soplex::LPCol(
          0.0,
          emptyColumn,
          toSoplexBound(var.ub),
          toSoplexBound(var.lb)
        ));
      }

      for (const RowSpec& row : activeModel_.rows) {
        if (!addBackendRow(row, error)) return false;
      }
      return true;
    } catch (const std::exception& ex) {
      error = std::string("SoPlex initialization failed: ") + ex.what();
      return false;
    }
  }

  bool solveStage(
    ObjectiveMode objective,
    bool captureValues,
    StageSolution& solution,
    std::string& error
  ) override {
    const auto stageStart = std::chrono::steady_clock::now();
    try {
      for (int i = 0; i < static_cast<int>(activeModel_.vars.size()); ++i) {
        solver_.changeObjReal(i, getObjectiveCoeff(activeModel_.vars[static_cast<size_t>(i)], objective));
      }

      const int status = static_cast<int>(solver_.optimize(
        control_ != nullptr ? control_->interruptFlag : nullptr
      ));
      totalLpIterations_ += static_cast<double>(solver_.numIterations());
      if (status != 1) {
        if (isCancellationRequested(control_)) {
          error = "CANCELLED";
          return false;
        }
        if (status == 2) {
          error = "UNBOUNDED";
          return false;
        }
        if (status == 3 || status == 4) {
          error = "INFEASIBLE";
          return false;
        }
        std::ostringstream out;
        out << "SoPlex stage did not finish optimal; status code " << status << ".";
        error = out.str();
        return false;
      }

      std::vector<double> stageValues(activeModel_.vars.size(), 0.0);
      if (!stageValues.empty() &&
          !solver_.getPrimalReal(stageValues.data(), static_cast<int>(stageValues.size()))) {
        error = "SoPlex reported optimal status but did not expose a primal solution.";
        return false;
      }

      solution.objectiveValue = recomputeObjectiveValue(activeModel_, objective, stageValues);
      if (!validateStageSolution(activeModel_, objective, stageValues, solution.objectiveValue, error)) {
        return false;
      }

      if (captureValues) solution.values = std::move(stageValues);
      solution.elapsedMs = elapsedMilliseconds(stageStart);
      return true;
    } catch (const std::exception& ex) {
      error = std::string("SoPlex stage failed: ") + ex.what();
      return false;
    }
  }

 protected:
  bool addBackendRow(const RowSpec& rowSpec, std::string& error) override {
    try {
      soplex::DSVector row(static_cast<int>(rowSpec.terms.size()));
      for (const TermSpec& term : rowSpec.terms) {
        if (term.varIndex < 0 || term.varIndex >= static_cast<int>(activeModel_.vars.size())) continue;
        row.add(term.varIndex, term.coeff);
      }
      solver_.addRowReal(soplex::LPRow(
        toSoplexBound(rowSpec.lhs),
        row,
        toSoplexBound(rowSpec.rhs)
      ));
      return true;
    } catch (const std::exception& ex) {
      error = std::string("Add SoPlex row failed: ") + ex.what();
      return false;
    }
  }

  bool changeBackendBounds(int varIndex, const VariableSpec& var, std::string& error) override {
    try {
      solver_.changeBoundsReal(varIndex, toSoplexBound(var.lb), toSoplexBound(var.ub));
      return true;
    } catch (const std::exception& ex) {
      error = std::string("Change SoPlex bounds failed: ") + ex.what();
      return false;
    }
  }

 private:
  soplex::SoPlex solver_;
  double totalLpIterations_ = 0.0;
};

class ReusableScipStagedLpEngine final : public StagedLpEngine {
 public:
  ReusableScipStagedLpEngine(
    ModelSpec model,
    SolveOptions options,
    SolveControl* control = nullptr
  ) : StagedLpEngine(std::move(model), control), options_(options) {}

  ~ReusableScipStagedLpEngine() override {
    clearActiveScip();
  }

  std::string profileName() const override {
    return std::string("reusable_scip_") + options_.profileName;
  }

  bool initialize(std::string& error) override {
    if (!checkScip(SCIPcreate(&holder_.scip), "Create reusable SCIP", error)) return false;
    if (!checkScip(SCIPincludeDefaultPlugins(holder_.scip), "Include SCIP default plugins", error)) return false;
    if (!applySolveOptions(holder_.scip, options_, error)) return false;
    if (!checkScip(SCIPcreateProbBasic(holder_.scip, "industrialist_ratio_reusable"), "Create SCIP problem", error)) {
      return false;
    }
    if (!checkScip(SCIPsetObjsense(holder_.scip, SCIP_OBJSENSE_MINIMIZE), "Set SCIP objective sense", error)) {
      return false;
    }

    holder_.vars.resize(activeModel_.vars.size(), nullptr);
    for (int i = 0; i < static_cast<int>(activeModel_.vars.size()); ++i) {
      const VariableSpec& spec = activeModel_.vars[static_cast<size_t>(i)];
      SCIP_VAR* var = nullptr;
      if (!checkScip(
            SCIPcreateVarBasic(
              holder_.scip,
              &var,
              spec.name.c_str(),
              toScipBound(holder_.scip, spec.lb),
              toScipBound(holder_.scip, spec.ub),
              0.0,
              spec.kind == VariableKind::Binary
                ? SCIP_VARTYPE_BINARY
                : spec.kind == VariableKind::Integer
                  ? SCIP_VARTYPE_INTEGER
                  : SCIP_VARTYPE_CONTINUOUS
            ),
            "Create reusable SCIP variable",
            error
          )) {
        return false;
      }
      holder_.vars[static_cast<size_t>(i)] = var;
      if (!checkScip(SCIPaddVar(holder_.scip, var), "Add reusable SCIP variable", error)) return false;
    }

    for (const RowSpec& row : activeModel_.rows) {
      if (!addBackendRow(row, error)) return false;
    }
    return true;
  }

  bool addStartSolution(const std::vector<double>& values, std::string& error) {
    if (values.size() != holder_.vars.size()) {
      error = "SCIP start solution length did not match the model.";
      return false;
    }

    SCIP_SOL* solution = nullptr;
    if (!checkScip(SCIPcreateSol(holder_.scip, &solution, nullptr), "Create SCIP start solution", error)) {
      return false;
    }

    bool ok = true;
    for (int i = 0; i < static_cast<int>(values.size()); ++i) {
      if (!checkScip(
            SCIPsetSolVal(
              holder_.scip,
              solution,
              holder_.vars[static_cast<size_t>(i)],
              values[static_cast<size_t>(i)]
            ),
            "Set SCIP start solution value",
            error
          )) {
        ok = false;
        break;
      }
    }

    SCIP_Bool stored = FALSE;
    if (ok) {
      ok = checkScip(
        SCIPaddSolFree(holder_.scip, &solution, &stored),
        "Add SCIP start solution",
        error
      );
    } else if (solution != nullptr) {
      SCIPfreeSol(holder_.scip, &solution);
    }

    // A rejected warm start affects speed, not correctness; SCIP can still prove the model.
    return ok;
  }

  void collectTelemetry(SolveTelemetry& telemetry) const override {
    telemetry.mipNodeCount = mipNodeCount_;
    telemetry.lpIterations += lpIterations_;
    telemetry.primalBound = primalBound_;
    telemetry.dualBound = dualBound_;
    telemetry.mipGap = mipGap_;
  }

  bool solveStage(
    ObjectiveMode objective,
    bool captureValues,
    StageSolution& solution,
    std::string& error
  ) override {
    const auto stageStart = std::chrono::steady_clock::now();
    if (isCancellationRequested(control_)) {
      error = "CANCELLED";
      return false;
    }
    for (int i = 0; i < static_cast<int>(activeModel_.vars.size()); ++i) {
      if (!checkScip(
            SCIPchgVarObj(
              holder_.scip,
              holder_.vars[static_cast<size_t>(i)],
              getObjectiveCoeff(activeModel_.vars[static_cast<size_t>(i)], objective)
            ),
            "Change reusable SCIP objective",
            error
          )) {
        return false;
      }
    }

    if (!publishActiveScip(error)) return false;
    const SCIP_RETCODE solveRetcode = SCIPsolve(holder_.scip);
    clearActiveScip();
    if (!checkScip(solveRetcode, "Solve reusable SCIP stage", error)) return false;

    const SCIP_STATUS status = SCIPgetStatus(holder_.scip);
    if (status != SCIP_STATUS_OPTIMAL) {
      if (status == SCIP_STATUS_USERINTERRUPT || isCancellationRequested(control_)) {
        error = "CANCELLED";
        return false;
      }
      if (status == SCIP_STATUS_INFEASIBLE || status == SCIP_STATUS_INFORUNBD) {
        error = "INFEASIBLE";
        return false;
      }
      if (status == SCIP_STATUS_UNBOUNDED) {
        error = "UNBOUNDED";
        return false;
      }
      if (status == SCIP_STATUS_TIMELIMIT || status == SCIP_STATUS_NODELIMIT ||
          status == SCIP_STATUS_MEMLIMIT || status == SCIP_STATUS_GAPLIMIT) {
        error = "LIMIT_REACHED_NOT_PROVEN";
        return false;
      }
      std::ostringstream out;
      out << "Reusable SCIP stage did not finish optimal; status code " << status << ".";
      error = out.str();
      return false;
    }

    SCIP_SOL* bestSol = SCIPgetBestSol(holder_.scip);
    if (bestSol == nullptr) {
      error = "Reusable SCIP reported optimal status but did not expose a best solution.";
      return false;
    }

    std::vector<double> stageValues(activeModel_.vars.size(), 0.0);
    for (int i = 0; i < static_cast<int>(activeModel_.vars.size()); ++i) {
      const double value = SCIPgetSolVal(holder_.scip, bestSol, holder_.vars[static_cast<size_t>(i)]);
      if (!std::isfinite(value)) {
        error = "Reusable SCIP returned a non-finite value for variable " +
          activeModel_.vars[static_cast<size_t>(i)].name + ".";
        return false;
      }
      stageValues[static_cast<size_t>(i)] = value;
    }

    solution.objectiveValue = recomputeObjectiveValue(activeModel_, objective, stageValues);
    if (!validateStageSolution(activeModel_, objective, stageValues, solution.objectiveValue, error)) {
      return false;
    }

    if (captureValues) solution.values = std::move(stageValues);
    solution.elapsedMs = elapsedMilliseconds(stageStart);

    mipNodeCount_ = static_cast<double>(SCIPgetNTotalNodes(holder_.scip));
    lpIterations_ = static_cast<double>(SCIPgetNLPIterations(holder_.scip));
    primalBound_ = SCIPgetPrimalbound(holder_.scip);
    dualBound_ = SCIPgetDualbound(holder_.scip);
    mipGap_ = SCIPgetGap(holder_.scip);

    if (!checkScip(SCIPfreeTransform(holder_.scip), "Free reusable SCIP transformed problem", error)) {
      return false;
    }
    return true;
  }

 protected:
  bool addBackendRow(const RowSpec& row, std::string& error) override {
    return addScipLinearRow(holder_.scip, holder_.vars, row, error);
  }

  bool changeBackendBounds(int varIndex, const VariableSpec& var, std::string& error) override {
    if (varIndex < 0 || varIndex >= static_cast<int>(holder_.vars.size())) return true;
    SCIP_VAR* scipVar = holder_.vars[static_cast<size_t>(varIndex)];
    if (!checkScip(
          SCIPchgVarLb(holder_.scip, scipVar, toScipBound(holder_.scip, var.lb)),
          "Change reusable SCIP lower bound",
          error
        )) {
      return false;
    }
    return checkScip(
      SCIPchgVarUb(holder_.scip, scipVar, toScipBound(holder_.scip, var.ub)),
      "Change reusable SCIP upper bound",
      error
    );
  }

 private:
  bool publishActiveScip(std::string& error) {
    if (control_ == nullptr || control_->activeScip == nullptr) {
      if (isCancellationRequested(control_)) {
        error = "CANCELLED";
        return false;
      }
      return true;
    }

    if (control_->activeScipMutex != nullptr) {
      std::lock_guard<std::mutex> lock(*control_->activeScipMutex);
      if (isCancellationRequested(control_)) {
        error = "CANCELLED";
        return false;
      }
      control_->activeScip->store(holder_.scip, std::memory_order_release);
      return true;
    }

    if (isCancellationRequested(control_)) {
      error = "CANCELLED";
      return false;
    }
    control_->activeScip->store(holder_.scip, std::memory_order_release);
    return true;
  }

  void clearActiveScip() {
    if (control_ == nullptr || control_->activeScip == nullptr) return;
    if (control_->activeScipMutex != nullptr) {
      std::lock_guard<std::mutex> lock(*control_->activeScipMutex);
      control_->activeScip->store(nullptr, std::memory_order_release);
      return;
    }
    control_->activeScip->store(nullptr, std::memory_order_release);
  }

  SolveOptions options_;
  ScipHolder holder_;
  double mipNodeCount_ = 0.0;
  double lpIterations_ = 0.0;
  double primalBound_ = 0.0;
  double dualBound_ = 0.0;
  double mipGap_ = 0.0;
};

bool lockStageResult(
  StagedLpEngine& engine,
  const std::string& name,
  ObjectiveMode objective,
  double optimum,
  std::string& error
) {
  if (!engine.addObjectiveBoundRow(name, objective, optimum, error)) {
    error = "Add " + name + " objective bound failed: " + error;
    return false;
  }
  if (!engine.tightenObjectiveVariableBounds(objective, optimum, error)) {
    error = "Tighten " + name + " variable bounds failed: " + error;
    return false;
  }
  return true;
}

bool solveAndLockFlowStages(
  StagedLpEngine& engine,
  SolveTelemetry& telemetry,
  std::string& error
) {
  struct FlowStage {
    const char* name;
    const char* description;
    ObjectiveMode objective;
    bool enabled;
    int stageCode;
  };
  const FlowStage stages[] = {
    {"shortage", "Stage 1 shortage minimization", ObjectiveMode::Shortage,
     engine.model().hasShortageObjective, 1},
    {"sink_excess", "Stage 2 sink excess minimization", ObjectiveMode::SinkExcess,
     engine.model().hasSinkExcessObjective, 2},
  };

  for (const FlowStage& stage : stages) {
    if (!stage.enabled) {
      if (stage.objective == ObjectiveMode::Shortage) {
        telemetry.stages.push_back({stage.name, 0.0, 0.0});
      }
      continue;
    }

    engine.reportStage(stage.stageCode);
    StageSolution solution;
    if (!engine.solveStage(stage.objective, false, solution, error)) {
      error = std::string(stage.description) + " failed: " + error;
      return false;
    }
    telemetry.stages.push_back({stage.name, solution.objectiveValue, solution.elapsedMs});
    if (!lockStageResult(engine, stage.name, stage.objective, solution.objectiveValue, error)) {
      return false;
    }
  }
  return true;
}

bool applyInfiniteMachineCostPreference(
  StagedLpEngine& engine,
  int tierIndex,
  SolveTelemetry& telemetry,
  std::string& error
) {
  if (engine.model().infiniteMachineCostTier != tierIndex + 1) return true;
  const bool hasInfiniteCostVariables = std::any_of(
    engine.model().vars.begin(),
    engine.model().vars.end(),
    [](const VariableSpec& var) { return var.infiniteMachineCostUsageCoeff > 0.0; }
  );
  if (!hasInfiniteCostVariables) return true;

  StageSolution usageSolution;
  if (!engine.solveStage(
        ObjectiveMode::InfiniteMachineCostUsage,
        false,
        usageSolution,
        error
      )) {
    error = "Infinite machine-cost feasibility probe failed: " + error;
    return false;
  }
  telemetry.stages.push_back({
    "infinite_machine_cost",
    usageSolution.objectiveValue,
    usageSolution.elapsedMs,
  });

  // Only zero versus nonzero matters: once any such machine is required, every
  // feasible solution has infinite total cost and finite objectives break ties.
  if (usageSolution.objectiveValue == 0.0 &&
      !engine.fixObjectiveVariablesToZero(ObjectiveMode::InfiniteMachineCostUsage, error)) {
    error = "Exclude avoidable infinite-cost machines failed: " + error;
    return false;
  }
  return true;
}

bool solveAllStagesWithEngine(
  StagedLpEngine& engine,
  StageSolution& finalSolution,
  SolveTelemetry& telemetry,
  std::string& error
) {
  const auto solveStart = std::chrono::steady_clock::now();
  telemetry.profileName = engine.profileName();
  telemetry.stages.clear();
  telemetry.stages.reserve(4);

  if (!engine.initialize(error)) {
    error = "Initialize " + engine.profileName() + " failed: " + error;
    return false;
  }

  if (!solveAndLockFlowStages(engine, telemetry, error)) return false;

  if (!engine.activateDeferredLimits(error)) {
    error = "Apply user limits after flow-priority stages failed: " + error;
    return false;
  }

  const ObjectiveMode tierModes[] = {ObjectiveMode::Tier1, ObjectiveMode::Tier2, ObjectiveMode::Tier3};
  for (int tierIndex = 0; tierIndex < engine.model().tierCount; ++tierIndex) {
    StageSolution tierSolution;
    engine.reportStage(3 + tierIndex);
    if (!applyInfiniteMachineCostPreference(engine, tierIndex, telemetry, error)) return false;
    if (!engine.solveStage(tierModes[tierIndex], false, tierSolution, error)) {
      error = "Objective tier " + std::to_string(tierIndex + 1) + " minimization failed: " + error;
      return false;
    }
    const std::string tierName = "tier_" + std::to_string(tierIndex + 1);
    telemetry.stages.push_back({tierName, tierSolution.objectiveValue, tierSolution.elapsedMs});
    if (!lockStageResult(engine, tierName, tierModes[tierIndex], tierSolution.objectiveValue, error)) return false;
  }

  engine.reportStage(6);
  if (!engine.solveStage(ObjectiveMode::MachineCount, true, finalSolution, error)) {
    error = "Stage 4 machine-count tie-break failed: " + error;
    return false;
  }
  telemetry.stages.push_back({
    "machine_count",
    finalSolution.objectiveValue,
    finalSolution.elapsedMs,
  });
  engine.collectTelemetry(telemetry);
  telemetry.totalMs = elapsedMilliseconds(solveStart);

  return true;
}

bool solveAllStagesWithSoplex(
  ModelSpec model,
  StageSolution& finalSolution,
  ModelSpec& finalModel,
  SolveTelemetry& telemetry,
  std::string& error,
  SolveControl* control = nullptr
) {
  SoplexStagedLpEngine engine(std::move(model), control);
  if (!solveAllStagesWithEngine(engine, finalSolution, telemetry, error)) return false;
  finalModel = engine.takeModel();
  return true;
}

bool buildRoundedMilpModel(
  ModelSpec lockedLpModel,
  const StageSolution& lpRelaxation,
  ModelSpec& milpModel,
  std::vector<double>& startValues,
  double& incumbentObjective,
  std::string& error
) {
  if (lpRelaxation.values.size() != lockedLpModel.vars.size()) {
    error = "Rounded MILP construction requires a complete LP relaxation solution.";
    return false;
  }

  const size_t roundedVariableCount = lockedLpModel.roundedTierCoeffByNode.size();
  milpModel = std::move(lockedLpModel);
  milpModel.vars.reserve(
    milpModel.vars.size() + roundedVariableCount
  );
  milpModel.rows.reserve(
    milpModel.rows.size() + roundedVariableCount
  );
  startValues = lpRelaxation.values;

  for (int nodeIndex = 0;
       nodeIndex < static_cast<int>(milpModel.machineVarByNode.size());
       ++nodeIndex) {
    const int machineVarIndex = milpModel.machineVarByNode[static_cast<size_t>(nodeIndex)];
    if (machineVarIndex < 0 || machineVarIndex >= static_cast<int>(milpModel.vars.size())) continue;

    VariableSpec& machineVar = milpModel.vars[static_cast<size_t>(machineVarIndex)];
    const double machineScale = machineVar.physicalScale;
    machineVar.tierCoeff = machineVar.continuousTierCoeff;

    const auto& roundedCoeffs = milpModel.roundedTierCoeffByNode[static_cast<size_t>(nodeIndex)];
    const bool neededForObjective = std::any_of(
      roundedCoeffs.begin(), roundedCoeffs.end(), [](double value) { return value > 0.0; });
    const bool neededForLimit = std::any_of(
      milpModel.roundedMetricLimits.begin(), milpModel.roundedMetricLimits.end(),
      [](double value) { return value >= 0.0; });
    if (!neededForObjective && !neededForLimit) continue;

    const double physicalMachineValue = std::max(
      0.0,
      lpRelaxation.values[static_cast<size_t>(machineVarIndex)] * machineScale
    );
    const double roundedStart = ceilMachineCount(physicalMachineValue);

    VariableSpec roundedVar;
    roundedVar.name = "whole_" + std::to_string(nodeIndex);
    roundedVar.kind = VariableKind::Integer;
    roundedVar.lb = ceilMachineCount(std::max(0.0, machineVar.lb * machineScale));
    roundedVar.ub = std::numeric_limits<double>::infinity();
    roundedVar.tierCoeff = roundedCoeffs;
    const int roundedVarIndex = addVariable(milpModel, std::move(roundedVar));
    milpModel.roundedVarByNode[static_cast<size_t>(nodeIndex)] = roundedVarIndex;
    startValues.push_back(std::max(roundedStart, milpModel.vars[static_cast<size_t>(roundedVarIndex)].lb));

    RowSpec linkingRow;
    linkingRow.name = "whole_link_" + std::to_string(nodeIndex);
    linkingRow.lhs = -std::numeric_limits<double>::infinity();
    linkingRow.rhs = kIntegralityTolerance;
    linkingRow.terms.reserve(2);
    addRowTerm(
      linkingRow,
      machineVarIndex,
      machineScale * (1.0 - kMachineIntegerRelativeTolerance)
    );
    addRowTerm(linkingRow, roundedVarIndex, -1.0);
    milpModel.rows.push_back(std::move(linkingRow));

    // This and whole_link encode the same absolute-plus-relative tolerance used by
    // ceilMachineCount: -1 + absTol < (1 - relTol) * physical - whole <= absTol.
    RowSpec ceilingBandRow;
    ceilingBandRow.name = "whole_band_" + std::to_string(nodeIndex);
    ceilingBandRow.lhs = -1.0 + kIntegralityTolerance;
    ceilingBandRow.rhs = std::numeric_limits<double>::infinity();
    ceilingBandRow.terms.reserve(2);
    addRowTerm(
      ceilingBandRow,
      machineVarIndex,
      machineScale * (1.0 - kMachineIntegerRelativeTolerance)
    );
    addRowTerm(ceilingBandRow, roundedVarIndex, -1.0);
    milpModel.rows.push_back(std::move(ceilingBandRow));
  }

  static const char* kRoundedLimitNames[] = {"machine_cost", "machine_space", "model_count"};
  for (int metricIndex = 0; metricIndex < 3; ++metricIndex) {
    const double limit = milpModel.roundedMetricLimits[static_cast<size_t>(metricIndex)];
    if (limit < 0.0) continue;
    RowSpec row;
    row.name = std::string("user_limit_") + kRoundedLimitNames[metricIndex];
    row.lhs = -std::numeric_limits<double>::infinity();
    row.rhs = limit;
    for (int nodeIndex = 0; nodeIndex < static_cast<int>(milpModel.roundedVarByNode.size()); ++nodeIndex) {
      addRowTerm(row, milpModel.roundedVarByNode[static_cast<size_t>(nodeIndex)],
        milpModel.roundedMetricValueByNode[static_cast<size_t>(nodeIndex)][static_cast<size_t>(metricIndex)]);
    }
    milpModel.deferredLimitRows.push_back(std::move(row));
  }

  incumbentObjective = recomputeObjectiveValue(
    milpModel,
    ObjectiveMode::Tier1,
    startValues
  );
  if (!std::isfinite(incumbentObjective)) {
    error = "Rounded LP incumbent objective was not finite.";
    return false;
  }

  const double incumbentRhs = getStageBoundRhs(milpModel, incumbentObjective);
  const bool hasRoundedLimit = std::any_of(
    milpModel.roundedMetricLimits.begin(), milpModel.roundedMetricLimits.end(),
    [](double value) { return value >= 0.0; });
  const bool tierOneHasInfiniteMachineCost =
    milpModel.infiniteMachineCostTier == 1 &&
    std::any_of(
      milpModel.vars.begin(),
      milpModel.vars.end(),
      [](const VariableSpec& var) { return var.infiniteMachineCostUsageCoeff > 0.0; }
    );
  for (int nodeIndex = 0;
       nodeIndex < static_cast<int>(milpModel.roundedVarByNode.size());
       ++nodeIndex) {
    const int roundedVarIndex = milpModel.roundedVarByNode[static_cast<size_t>(nodeIndex)];
    if (roundedVarIndex < 0) continue;
    VariableSpec& roundedVar = milpModel.vars[static_cast<size_t>(roundedVarIndex)];
    const double roundedCoeff = roundedVar.tierCoeff[0];
    const double startValue = startValues[static_cast<size_t>(roundedVarIndex)];
    if (!hasRoundedLimit && !tierOneHasInfiniteMachineCost && roundedCoeff > 0.0) {
      const double objectiveUpperBound = std::floor(
        incumbentRhs / roundedCoeff + kIntegralityTolerance
      );
      roundedVar.ub = std::max(roundedVar.lb, std::max(startValue, objectiveUpperBound));
    }

    const int machineVarIndex = milpModel.machineVarByNode[static_cast<size_t>(nodeIndex)];
    if (!hasRoundedLimit && !tierOneHasInfiniteMachineCost &&
        machineVarIndex >= 0 && std::isfinite(roundedVar.ub)) {
      const double machineScale =
        milpModel.vars[static_cast<size_t>(machineVarIndex)].physicalScale;
      tightenUpperBound(
        milpModel.vars[static_cast<size_t>(machineVarIndex)],
        roundedVar.ub / machineScale
      );
    }
  }

  if (!hasRoundedLimit && !tierOneHasInfiniteMachineCost) {
    tightenObjectiveVariableBounds(milpModel, ObjectiveMode::Tier1, incumbentObjective);
  }
  if (!validateStageSolution(
        milpModel,
        ObjectiveMode::Tier1,
        startValues,
        incumbentObjective,
        error
      )) {
    error = "Rounded LP incumbent validation failed: " + error;
    return false;
  }
  return true;
}

bool normalizeRoundedMachineVariables(
  const ModelSpec& model,
  StageSolution& solution,
  std::string& error
) {
  if (solution.values.size() != model.vars.size()) {
    error = "Rounded machine normalization requires a complete MILP solution.";
    return false;
  }

  for (int nodeIndex = 0;
       nodeIndex < static_cast<int>(model.roundedVarByNode.size());
       ++nodeIndex) {
    const int roundedVarIndex = model.roundedVarByNode[static_cast<size_t>(nodeIndex)];
    if (roundedVarIndex < 0) continue;
    const int machineVarIndex = model.machineVarByNode[static_cast<size_t>(nodeIndex)];
    if (machineVarIndex < 0 || machineVarIndex >= static_cast<int>(model.vars.size()) ||
        roundedVarIndex >= static_cast<int>(model.vars.size())) {
      error = "Rounded machine normalization found an invalid variable mapping.";
      return false;
    }

    const double physicalMachineCount = std::max(
      0.0,
      solution.values[static_cast<size_t>(machineVarIndex)] *
        model.vars[static_cast<size_t>(machineVarIndex)].physicalScale
    );
    const double exactRoundedCount = ceilMachineCount(physicalMachineCount);
    const VariableSpec& roundedVar = model.vars[static_cast<size_t>(roundedVarIndex)];
    if ((std::isfinite(roundedVar.lb) && exactRoundedCount < roundedVar.lb) ||
        (std::isfinite(roundedVar.ub) && exactRoundedCount > roundedVar.ub)) {
      error = "Rounded machine normalization produced a value outside its proven bounds.";
      return false;
    }
    solution.values[static_cast<size_t>(roundedVarIndex)] = exactRoundedCount;
  }

  solution.objectiveValue = recomputeObjectiveValue(
    model,
    ObjectiveMode::MachineCount,
    solution.values
  );
  return validateStageSolution(
    model,
    ObjectiveMode::MachineCount,
    solution.values,
    solution.objectiveValue,
    error
  );
}

bool solveAllStagesWithRoundedMilp(
  ModelSpec model,
  StageSolution& finalSolution,
  ModelSpec& finalModel,
  SolveTelemetry& telemetry,
  std::string& error,
  SolveControl* control = nullptr
) {
  const auto solveStart = std::chrono::steady_clock::now();
  telemetry.profileName = "scip_rounded_milp";
  telemetry.stages.clear();
  telemetry.stages.reserve(4);

  StageSolution lpRelaxation;
  ModelSpec milpModel;
  std::vector<double> startValues;
  double incumbentObjective = 0.0;
  {
    SoplexStagedLpEngine lpEngine(std::move(model), control);
    if (!lpEngine.initialize(error)) {
      error = "Initialize staged SoPlex model failed: " + error;
      return false;
    }
    if (!solveAndLockFlowStages(lpEngine, telemetry, error)) return false;
    if (!lpEngine.activateDeferredLimits(error)) {
      error = "Apply user limits after flow-priority stages failed: " + error;
      return false;
    }

    lpEngine.reportStage(3);
    if (!lpEngine.solveStage(ObjectiveMode::Tier1, true, lpRelaxation, error)) {
      error = "Stage 3 LP relaxation failed: " + error;
      return false;
    }
    lpEngine.collectTelemetry(telemetry);
    if (!buildRoundedMilpModel(
          lpEngine.takeModel(), lpRelaxation, milpModel, startValues,
          incumbentObjective, error
        )) {
      return false;
    }
  }

  SolveOptions options;
  options.profileName = "rounded_milp";
  options.useNumericsEmphasis = true;
  options.useFastPresolve = true;
  options.disableSymmetry = true;
  options.disableMilpPresolver = true;
  ReusableScipStagedLpEngine milpEngine(std::move(milpModel), options, control);
  if (!milpEngine.initialize(error)) {
    error = "Initialize rounded SCIP model failed: " + error;
    return false;
  }
  if (!milpEngine.addStartSolution(startValues, error)) {
    error = "Add rounded LP incumbent failed: " + error;
    return false;
  }
  if (!milpEngine.activateDeferredLimits(error)) {
    error = "Apply rounded user limits failed: " + error;
    return false;
  }

  const ObjectiveMode tierModes[] = {ObjectiveMode::Tier1, ObjectiveMode::Tier2, ObjectiveMode::Tier3};
  for (int tierIndex = 0; tierIndex < milpEngine.model().tierCount; ++tierIndex) {
    milpEngine.reportStage(3 + tierIndex);
    if (!applyInfiniteMachineCostPreference(milpEngine, tierIndex, telemetry, error)) return false;
    StageSolution tierSolution;
    if (!milpEngine.solveStage(tierModes[tierIndex], true, tierSolution, error)) {
      error = "Rounded objective tier " + std::to_string(tierIndex + 1) + " failed: " + error;
      return false;
    }
    const std::string tierName = "tier_" + std::to_string(tierIndex + 1);
    telemetry.stages.push_back({tierName, tierSolution.objectiveValue, tierSolution.elapsedMs});
    if (!lockStageResult(milpEngine, tierName, tierModes[tierIndex], tierSolution.objectiveValue, error)) return false;
  }

  milpEngine.reportStage(6);
  if (!milpEngine.solveStage(ObjectiveMode::MachineCount, true, finalSolution, error)) {
    error = "Stage 4 machine-count tie-break failed: " + error;
    return false;
  }
  telemetry.stages.push_back({
    "machine_count",
    finalSolution.objectiveValue,
    finalSolution.elapsedMs,
  });
  if (!normalizeRoundedMachineVariables(milpEngine.model(), finalSolution, error)) {
    error = "Normalize exact rounded machine counts failed: " + error;
    return false;
  }
  telemetry.roundedVariableCount = static_cast<int>(
    std::count_if(
      milpEngine.model().roundedVarByNode.begin(),
      milpEngine.model().roundedVarByNode.end(),
      [](int value) { return value >= 0; }
    )
  );
  milpEngine.collectTelemetry(telemetry);
  telemetry.totalMs = elapsedMilliseconds(solveStart);
  finalModel = milpEngine.takeModel();
  return true;
}


double getPhysicalOutputValue(const ModelSpec& model, const StageSolution& solution, int varIndex) {
  if (varIndex < 0 || varIndex >= static_cast<int>(solution.values.size())) return 0.0;

  const VariableSpec& var = model.vars[static_cast<size_t>(varIndex)];
  double scaledValue = solution.values[static_cast<size_t>(varIndex)];
  const bool isFixed = std::isfinite(var.lb) &&
    std::isfinite(var.ub) &&
    var.lb == var.ub;
  if (isFixed) {
    scaledValue = var.lb;
  } else if (
    std::isfinite(var.lb) &&
    scaledValue < var.lb &&
    var.lb - scaledValue <= getValidationTolerance(scaledValue, var.lb)
  ) {
    scaledValue = var.lb;
  }

  double value = scaledValue * var.physicalScale;
  if (std::abs(value) < 1e-12) value = 0.0;
  return value;
}

double getProfileCode(const std::string& profileName) {
  if (profileName == "soplex_direct") return 1.0;
  if (profileName == "scip_rounded_milp") return 4.0;
  if (profileName.rfind("reusable_scip_", 0) == 0) return 2.0;
  if (profileName.rfind("fresh_scip_", 0) == 0) return 3.0;
  return 0.0;
}

double getStageCode(const std::string& stageName) {
  if (stageName == "shortage") return 1.0;
  if (stageName == "sink_excess") return 2.0;
  if (stageName == "tier_1" || stageName == "weighted") return 3.0;
  if (stageName == "tier_2") return 4.0;
  if (stageName == "tier_3") return 5.0;
  if (stageName == "machine_count") return 6.0;
  if (stageName == "infinite_machine_cost") return 7.0;
  return 0.0;
}

size_t getInputValueCount(const ModelSpec& model) {
  size_t count = 0;
  for (const std::vector<int>& inputs : model.deficitVarByNodeInput) {
    count += inputs.size();
  }
  return count;
}

double* copyToOwnedDoubleBuffer(const std::vector<double>& values) {
  if (values.empty()) return nullptr;
  const size_t byteLength = values.size() * sizeof(double);
  double* out = static_cast<double*>(std::malloc(byteLength));
  if (out == nullptr) return nullptr;
  std::memcpy(out, values.data(), byteLength);
  return out;
}

std::vector<double> buildBinarySolutionValues(
  const ModelSpec& model,
  const StageSolution& solution,
  const SolveTelemetry& telemetry,
  NativeResultStatus status = NativeResultStatus::Optimal
) {
  const ModelStats stats = collectModelStats(model);
  const size_t stageEntryCount = telemetry.stages.size() * 3;
  const size_t machineEntryCount = model.machineVarByNode.size();
  const size_t flowEntryCount = model.edgeVarByConnection.size();
  const size_t inputEntryCount = getInputValueCount(model);
  const size_t totalDoubles =
    static_cast<size_t>(kBinaryResultHeaderDoubles) +
    stageEntryCount +
    machineEntryCount +
    flowEntryCount +
    inputEntryCount;

  std::vector<double> out(totalDoubles, 0.0);
  out[0] = kBinaryResultMagic;
  out[1] = static_cast<double>(totalDoubles);
  out[2] = kBinaryResultVersion;
  out[3] = static_cast<double>(status);
  out[4] = getProfileCode(telemetry.profileName);
  out[5] = telemetry.totalMs;
  out[6] = telemetry.modelBuildMs;
  out[7] = static_cast<double>(model.vars.size());
  out[8] = static_cast<double>(model.rows.size());
  out[9] = static_cast<double>(stats.nonzeroCount);
  out[10] = model.valueScale;
  out[11] = stats.minCoefficient;
  out[12] = stats.maxCoefficient;
  out[13] = stats.minFiniteBound;
  out[14] = stats.maxFiniteBound;
  out[15] = static_cast<double>(telemetry.stages.size());
  out[16] = static_cast<double>(machineEntryCount);
  out[17] = static_cast<double>(flowEntryCount);
  out[18] = static_cast<double>(inputEntryCount);
  out[19] = telemetry.payloadParseMs;
  out[20] = telemetry.mipNodeCount;
  out[21] = telemetry.lpIterations;
  out[22] = telemetry.primalBound;
  out[23] = telemetry.dualBound;
  out[24] = telemetry.mipGap;
  out[25] = static_cast<double>(telemetry.roundedVariableCount);

  size_t offset = static_cast<size_t>(kBinaryResultHeaderDoubles);
  for (const StageTelemetry& stage : telemetry.stages) {
    out[offset++] = getStageCode(stage.name);
    out[offset++] = stage.objectiveValue;
    out[offset++] = stage.elapsedMs;
  }

  for (int varIndex : model.machineVarByNode) {
    out[offset++] = getPhysicalOutputValue(model, solution, varIndex);
  }

  for (int varIndex : model.edgeVarByConnection) {
    out[offset++] = getPhysicalOutputValue(model, solution, varIndex);
  }

  for (const std::vector<int>& inputVars : model.deficitVarByNodeInput) {
    for (int varIndex : inputVars) {
      out[offset++] = getPhysicalOutputValue(model, solution, varIndex);
    }
  }

  return out;
}

bool solveNativePayloadStructured(
  NativeInput&& input,
  double payloadParseMs,
  NativeSolveResult& result,
  SolveControl* control = nullptr
) {
  setSolveStage(control, 0);
  if (isCancellationRequested(control)) {
    result.status = NativeResultStatus::Cancelled;
    result.error = "Computation cancelled.";
    return false;
  }
  std::string validationError;
  if (!validateNativeInput(input, validationError)) {
    result.status = NativeResultStatus::InvalidPayload;
    result.error = validationError;
    return false;
  }
  const auto modelBuildStart = std::chrono::steady_clock::now();
  ModelSpec model = buildModelSpec(input);
  const double modelBuildMs = elapsedMilliseconds(modelBuildStart);
  if (!validateModelDefinition(model, validationError)) {
    result.status = NativeResultStatus::InvalidPayload;
    result.error = validationError;
    return false;
  }
  StageSolution finalSolution;
  ModelSpec finalModel;
  SolveTelemetry telemetry;
  telemetry.payloadParseMs = payloadParseMs;
  telemetry.modelBuildMs = modelBuildMs;
  std::string attemptError;
  const bool hasRoundedObjective = model.hasRoundedObjective;
  const bool solved = hasRoundedObjective
    ? solveAllStagesWithRoundedMilp(
        std::move(model), finalSolution, finalModel, telemetry, attemptError, control
      )
    : solveAllStagesWithSoplex(
        std::move(model), finalSolution, finalModel, telemetry, attemptError, control
      );
  if (solved) {
    if (isCancellationRequested(control)) {
      result.status = NativeResultStatus::Cancelled;
      result.error = "Computation cancelled.";
      return false;
    }
    result.ok = true;
    result.status = NativeResultStatus::Optimal;
    result.model = std::move(finalModel);
    result.solution = std::move(finalSolution);
    result.telemetry = std::move(telemetry);
    return true;
  }

  if (isCancellationRequested(control) || attemptError.find("CANCELLED") != std::string::npos) {
    result.status = NativeResultStatus::Cancelled;
    result.error = "Computation cancelled.";
    return false;
  }
  if (attemptError.find("INFEASIBLE") != std::string::npos) {
    result.status = NativeResultStatus::Infeasible;
    result.error = "Native ratio model is infeasible.";
    return false;
  }
  if (attemptError.find("UNBOUNDED") != std::string::npos) {
    result.status = NativeResultStatus::Unbounded;
    result.error = "Native ratio model is unbounded.";
    return false;
  }
  if (attemptError.find("LIMIT_REACHED_NOT_PROVEN") != std::string::npos) {
    result.status = NativeResultStatus::LimitReachedNotProven;
    result.error = "Native ratio solve stopped before proving optimality.";
    return false;
  }

  std::ostringstream out;
  out << "Native staged ratio solve failed.\n" << attemptError;
  result.status = NativeResultStatus::NumericalFailure;
  result.error = out.str();
  return false;
}


bool solveNativeArrayPayloadStructured(
  const double* payload,
  int payloadDoubleCount,
  bool usePapiloReliabilityProfile,
  NativeSolveResult& result,
  SolveControl* control = nullptr
) {
  (void)usePapiloReliabilityProfile;
  NativeInput input;
  std::string error;
  const auto parseStart = std::chrono::steady_clock::now();
  if (!parsePayloadArray(payload, payloadDoubleCount, input, error)) {
    result.status = NativeResultStatus::InvalidPayload;
    result.error = error;
    return false;
  }
  return solveNativePayloadStructured(
    std::move(input),
    elapsedMilliseconds(parseStart),
    result,
    control
  );
}


enum class NativeJobState {
  Idle = 0,
  Running = 1,
  Complete = 2,
};

struct NativeAsyncJob {
  std::mutex mutex;
  std::thread worker;
  std::atomic<int> state{ static_cast<int>(NativeJobState::Idle) };
  std::atomic<int> stageCode{ 0 };
  std::atomic<SCIP*> activeScip{ nullptr };
  std::atomic<bool> cancellationRequested{ false };
  volatile bool soplexInterruptFlag = false;
  std::chrono::steady_clock::time_point startedAt;
  std::vector<double> resultValues;
  std::string error;
};

NativeAsyncJob g_asyncJob;

void markAsyncJobComplete() noexcept {
  g_asyncJob.activeScip.store(nullptr, std::memory_order_release);
  g_asyncJob.stageCode.store(7, std::memory_order_release);
  g_asyncJob.state.store(static_cast<int>(NativeJobState::Complete), std::memory_order_release);
}

void finishAsyncJobAfterException(const char* message) noexcept {
  std::lock_guard<std::mutex> lock(g_asyncJob.mutex);
  g_asyncJob.resultValues.clear();
  try {
    g_asyncJob.error = message;
  } catch (...) {
    g_asyncJob.error.clear();
  }
  markAsyncJobComplete();
}

void finishAsyncJob(NativeSolveResult&& solveResult) noexcept {
  try {
    std::lock_guard<std::mutex> lock(g_asyncJob.mutex);
    if (g_asyncJob.cancellationRequested.load(std::memory_order_acquire) &&
        solveResult.status == NativeResultStatus::Optimal) {
      solveResult.status = NativeResultStatus::Cancelled;
      solveResult.error = "Computation cancelled.";
    }
    g_asyncJob.resultValues = buildBinarySolutionValues(
      solveResult.model, solveResult.solution, solveResult.telemetry, solveResult.status
    );
    g_asyncJob.error = std::move(solveResult.error);
    markAsyncJobComplete();
  } catch (const std::bad_alloc&) {
    finishAsyncJobAfterException("Native ratio solve ran out of memory while finalizing its result.");
  } catch (const std::exception& ex) {
    finishAsyncJobAfterException(ex.what());
  } catch (...) {
    finishAsyncJobAfterException("Native ratio solve failed with an unknown exception.");
  }
}

int startNativeAsyncJob(
  const double* payload,
  int payloadDoubleCount,
  bool usePapiloReliabilityProfile
) {
  if (payload == nullptr || payloadDoubleCount <= 0) return 0;
  if (g_asyncJob.state.load(std::memory_order_acquire) !=
      static_cast<int>(NativeJobState::Idle)) {
    return 0;
  }

  if (g_asyncJob.worker.joinable()) {
    g_asyncJob.worker.join();
  }

  std::vector<double> payloadCopy;
  try {
    payloadCopy.assign(payload, payload + static_cast<size_t>(payloadDoubleCount));
  } catch (...) {
    return 0;
  }
  {
    std::lock_guard<std::mutex> lock(g_asyncJob.mutex);
    g_asyncJob.resultValues.clear();
    g_asyncJob.error.clear();
    g_asyncJob.cancellationRequested.store(false, std::memory_order_release);
    g_asyncJob.soplexInterruptFlag = false;
    g_asyncJob.startedAt = std::chrono::steady_clock::now();
  }
  g_asyncJob.stageCode.store(0, std::memory_order_release);
  g_asyncJob.activeScip.store(nullptr, std::memory_order_release);
  g_asyncJob.state.store(static_cast<int>(NativeJobState::Running), std::memory_order_release);

  try {
    g_asyncJob.worker = std::thread([
      payloadValues = std::move(payloadCopy),
      usePapiloReliabilityProfile
    ]() mutable {
      try {
        NativeSolveResult result;
        SolveControl control;
        control.interruptFlag = &g_asyncJob.soplexInterruptFlag;
        control.cancellationRequested = &g_asyncJob.cancellationRequested;
        control.stageCode = &g_asyncJob.stageCode;
        control.activeScip = &g_asyncJob.activeScip;
        control.activeScipMutex = &g_asyncJob.mutex;
        solveNativeArrayPayloadStructured(
          payloadValues.data(), static_cast<int>(payloadValues.size()),
          usePapiloReliabilityProfile, result, &control
        );
        finishAsyncJob(std::move(result));
      } catch (const std::bad_alloc&) {
        finishAsyncJobAfterException("Native ratio solve ran out of memory.");
      } catch (const std::exception& ex) {
        finishAsyncJobAfterException(ex.what());
      } catch (...) {
        finishAsyncJobAfterException("Native ratio solve failed with an unknown exception.");
      }
    });
  } catch (const std::exception& ex) {
    NativeSolveResult result;
    result.status = NativeResultStatus::InternalError;
    result.error = std::string("Failed to start native solve thread: ") + ex.what();
    finishAsyncJob(std::move(result));
    return 1;
  }

  return 1;
}

double* takeNativeAsyncJobResult() {
  if (g_asyncJob.state.load(std::memory_order_acquire) !=
      static_cast<int>(NativeJobState::Complete)) {
    return nullptr;
  }
  if (g_asyncJob.worker.joinable()) {
    g_asyncJob.worker.join();
  }

  std::lock_guard<std::mutex> lock(g_asyncJob.mutex);
  double* result = copyToOwnedDoubleBuffer(g_asyncJob.resultValues);
  if (result == nullptr) {
    if (g_asyncJob.resultValues.empty()) {
      g_asyncJob.state.store(static_cast<int>(NativeJobState::Idle), std::memory_order_release);
    }
    return nullptr;
  }
  std::vector<double>().swap(g_asyncJob.resultValues);
  g_asyncJob.state.store(static_cast<int>(NativeJobState::Idle), std::memory_order_release);
  return result;
}

char* copyToOwnedCString(const std::string& value) {
  char* out = static_cast<char*>(std::malloc(value.size() + 1));
  if (out == nullptr) return nullptr;
  std::memcpy(out, value.c_str(), value.size() + 1);
  return out;
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
int industrialist_has_native_ratio_solver() {
  return 1;
}

EMSCRIPTEN_KEEPALIVE
int industrialist_native_abi_version() {
  return 2;
}

EMSCRIPTEN_KEEPALIVE
int industrialist_native_capabilities() {
  return 31;
}

EMSCRIPTEN_KEEPALIVE
int industrialist_start_ratio_job_f64(
  const double* payload,
  int payloadDoubleCount,
  int usePapiloReliabilityProfile
) {
  return startNativeAsyncJob(
    payload,
    payloadDoubleCount,
    usePapiloReliabilityProfile != 0
  );
}

EMSCRIPTEN_KEEPALIVE
int industrialist_get_ratio_job_state() {
  return g_asyncJob.state.load(std::memory_order_acquire);
}

EMSCRIPTEN_KEEPALIVE
int industrialist_get_ratio_job_stage() {
  return g_asyncJob.stageCode.load(std::memory_order_acquire);
}

EMSCRIPTEN_KEEPALIVE
double industrialist_get_ratio_job_elapsed_ms() {
  if (g_asyncJob.state.load(std::memory_order_acquire) ==
      static_cast<int>(NativeJobState::Idle)) {
    return 0.0;
  }
  std::lock_guard<std::mutex> lock(g_asyncJob.mutex);
  return elapsedMilliseconds(g_asyncJob.startedAt);
}

EMSCRIPTEN_KEEPALIVE
int industrialist_cancel_ratio_job() {
  std::lock_guard<std::mutex> lock(g_asyncJob.mutex);
  if (g_asyncJob.state.load(std::memory_order_acquire) !=
      static_cast<int>(NativeJobState::Running)) {
    return 0;
  }
  g_asyncJob.cancellationRequested.store(true, std::memory_order_release);
  g_asyncJob.soplexInterruptFlag = true;
  SCIP* activeScip = g_asyncJob.activeScip.load(std::memory_order_acquire);
  if (activeScip != nullptr) {
    SCIPinterruptSolve(activeScip);
  }
  return 1;
}

EMSCRIPTEN_KEEPALIVE
double* industrialist_take_ratio_job_result() {
  return takeNativeAsyncJobResult();
}

EMSCRIPTEN_KEEPALIVE
char* industrialist_get_ratio_job_error() {
  std::lock_guard<std::mutex> lock(g_asyncJob.mutex);
  return copyToOwnedCString(g_asyncJob.error);
}

EMSCRIPTEN_KEEPALIVE
void industrialist_free_string(char* value) {
  std::free(value);
}

EMSCRIPTEN_KEEPALIVE
void industrialist_free_result_buffer(double* value) {
  std::free(value);
}

}
