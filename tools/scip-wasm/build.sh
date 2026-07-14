#!/usr/bin/env bash
set -euo pipefail

SCIP_VERSION="${SCIP_VERSION:-10.0.2}"
SCIP_SHA256="${SCIP_SHA256:-eecc29f31e8c8a3089c95ef99dd310d05e1546ba40f4ff36551d75a5f5c47073}"
SCIP_URL="${SCIP_URL:-https://github.com/scipopt/scip/releases/download/v${SCIP_VERSION}/scipoptsuite-${SCIP_VERSION}.tgz}"
PAPILO_VERSION="${PAPILO_VERSION:-3.0.0}"
PAPILO_SHA256="${PAPILO_SHA256:-04e2437c41404782fa31cd74a881b475d75a6e692e4c88a24bf48cf5d263a93d}"
PAPILO_URL="${PAPILO_URL:-https://github.com/scipopt/papilo/archive/refs/tags/v${PAPILO_VERSION}.tar.gz}"
TBB_VERSION="${TBB_VERSION:-v2021.13.0}"
TBB_SHA256="${TBB_SHA256:-3ad5dd08954b39d113dc5b3f8a8dc6dc1fd5250032b7c491eb07aed5c94133e1}"
TBB_URL="${TBB_URL:-https://github.com/oneapi-src/oneTBB/archive/refs/tags/${TBB_VERSION}.tar.gz}"
THIRD_PARTY_LICENSES_SHA256="${THIRD_PARTY_LICENSES_SHA256:-5b2b91e8e7cfd594f1124dbede2a6f2c115c2b2215b589baf351097bbc75ca98}"

BUILD_ROOT="${BUILD_ROOT:-/tmp/scip-wasm-build}"
SOURCE_ARCHIVE="${BUILD_ROOT}/scipoptsuite-${SCIP_VERSION}.tgz"
SOURCE_DIR="${BUILD_ROOT}/src"
BUILD_DIR="${BUILD_ROOT}/build"
TBB_SOURCE_ARCHIVE="${BUILD_ROOT}/onetbb-${TBB_VERSION}.tar.gz"
TBB_SOURCE_DIR="${BUILD_ROOT}/onetbb-src"
TBB_BUILD_DIR="${BUILD_ROOT}/onetbb-build"
TBB_INSTALL_DIR="${BUILD_ROOT}/onetbb-install"
TBB_CMAKE_DIR="${TBB_INSTALL_DIR}/lib/cmake/TBB"
PAPILO_SOURCE_ARCHIVE="${BUILD_ROOT}/papilo-${PAPILO_VERSION}.tar.gz"
PAPILO_SOURCE_DIR="${BUILD_ROOT}/papilo-src"
PAPILO_BUILD_DIR="${BUILD_ROOT}/papilo-build"
PAPILO_INSTALL_DIR="${BUILD_ROOT}/papilo-install"
PAPILO_CMAKE_DIR="${PAPILO_INSTALL_DIR}/lib/cmake/papilo"
HOST_BOOST_INCLUDE_ROOT="${BUILD_ROOT}/host-boost-include"
OUT_DIR="${OUT_DIR:-/workspace/public/scip}"
WITH_PAPILO="${WITH_PAPILO:-ON}"
WITH_TBB="${WITH_TBB:-ON}"
WITH_PTHREADS="${WITH_PTHREADS:-ON}"
PTHREAD_POOL_SIZE="${PTHREAD_POOL_SIZE:-4}"
SCIP_CONFIGURE_LOG="${BUILD_ROOT}/scip-configure.log"
INDUSTRIALIST_WRAPPER_SOURCE="/opt/scip-wasm/industrialist_ratio_wrapper.cpp"
ACTUAL_PAPILO_SHA256="none"
ACTUAL_TBB_SHA256="none"

if [[ "${WITH_TBB}" == "ON" && "${WITH_PTHREADS}" != "ON" ]]; then
  echo "WITH_TBB=ON requires WITH_PTHREADS=ON for a WASM build." >&2
  exit 1
fi

COMMON_C_FLAGS=""
COMMON_CXX_FLAGS="-I${HOST_BOOST_INCLUDE_ROOT}"

EMSCRIPTEN_LINK_FLAGS=(
  "-sWASM=1"
  "-sMODULARIZE=1"
  "-sEXPORT_ES6=1"
  "-sEXPORT_NAME=createSCIP"
  "-sINVOKE_RUN=0"
  "-sEXIT_RUNTIME=0"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sINITIAL_MEMORY=134217728"
  "-sMAXIMUM_MEMORY=2147483648"
  "-sFORCE_FILESYSTEM=1"
  "-sEXPORTED_FUNCTIONS=_main,_malloc,_free,_industrialist_has_native_ratio_solver,_industrialist_native_abi_version,_industrialist_native_capabilities,_industrialist_start_ratio_job_f64,_industrialist_get_ratio_job_state,_industrialist_get_ratio_job_stage,_industrialist_get_ratio_job_elapsed_ms,_industrialist_cancel_ratio_job,_industrialist_take_ratio_job_result,_industrialist_get_ratio_job_error,_industrialist_free_string,_industrialist_free_result_buffer"
  "-sEXPORTED_RUNTIME_METHODS=callMain,FS,UTF8ToString,HEAPF64"
  "-sENVIRONMENT=web,worker,node"
)

if [[ "${WITH_PTHREADS}" == "ON" ]]; then
  COMMON_C_FLAGS="${COMMON_C_FLAGS} -pthread"
  COMMON_CXX_FLAGS="${COMMON_CXX_FLAGS} -pthread"
  EMSCRIPTEN_LINK_FLAGS+=(
    "-pthread"
    "-sUSE_PTHREADS=1"
    "-sPTHREAD_POOL_SIZE=${PTHREAD_POOL_SIZE}"
  )
fi

if [[ "${WITH_PAPILO}" == "ON" ]]; then
  COMMON_CXX_FLAGS="${COMMON_CXX_FLAGS} -fexceptions"
  EMSCRIPTEN_LINK_FLAGS+=(
    "-fexceptions"
    "-sNO_DISABLE_EXCEPTION_CATCHING"
  )
fi

echo "==> Preparing build directories"
rm -rf "${BUILD_ROOT}"
mkdir -p "${BUILD_ROOT}" "${SOURCE_DIR}" "${BUILD_DIR}" "${OUT_DIR}" "${HOST_BOOST_INCLUDE_ROOT}"
ln -s /usr/include/boost "${HOST_BOOST_INCLUDE_ROOT}/boost"

echo "==> Downloading SCIP Optimization Suite ${SCIP_VERSION}"
curl --fail --location --retry 5 --retry-delay 2 --retry-all-errors "${SCIP_URL}" -o "${SOURCE_ARCHIVE}"

echo "==> Verifying source archive checksum"
echo "${SCIP_SHA256}  ${SOURCE_ARCHIVE}" | sha256sum -c -

echo "==> Extracting SCIP source"
tar -xzf "${SOURCE_ARCHIVE}" -C "${SOURCE_DIR}" --strip-components=1

if [[ -f "${INDUSTRIALIST_WRAPPER_SOURCE}" ]]; then
  echo "==> Attaching Industrialist native ratio wrapper to SCIP shell target"
  sed -i 's/set(TPI tny CACHE STRING "options for thread support library")/set(TPI none CACHE STRING "options for thread support library")/' \
    "${SOURCE_DIR}/scip/CMakeLists.txt"
  if [[ "${WITH_PAPILO}" == "ON" ]]; then
    sed -i '0,/if(PAPILO OR AUTOBUILD)/s//if(FALSE)/' "${SOURCE_DIR}/CMakeLists.txt"
  fi
  cat >> "${SOURCE_DIR}/scip/src/CMakeLists.txt" <<CMAKE

target_sources(scip PRIVATE "${INDUSTRIALIST_WRAPPER_SOURCE}")
CMAKE
else
  echo "Industrialist native wrapper source not found at ${INDUSTRIALIST_WRAPPER_SOURCE}" >&2
  exit 1
fi

if [[ "${WITH_TBB}" == "ON" ]]; then
  echo "==> Downloading oneTBB ${TBB_VERSION}"
  curl --fail --location --retry 5 --retry-delay 2 --retry-all-errors "${TBB_URL}" -o "${TBB_SOURCE_ARCHIVE}"
  ACTUAL_TBB_SHA256="$(sha256sum "${TBB_SOURCE_ARCHIVE}" | awk '{print $1}')"

  if [[ -n "${TBB_SHA256}" ]]; then
    echo "==> Verifying oneTBB source archive checksum"
    echo "${TBB_SHA256}  ${TBB_SOURCE_ARCHIVE}" | sha256sum -c -
  else
    echo "==> Skipping oneTBB checksum verification because TBB_SHA256 is empty"
  fi

  echo "==> Extracting oneTBB source"
  mkdir -p "${TBB_SOURCE_DIR}" "${TBB_BUILD_DIR}" "${TBB_INSTALL_DIR}"
  tar -xzf "${TBB_SOURCE_ARCHIVE}" -C "${TBB_SOURCE_DIR}" --strip-components=1

  echo "==> Configuring oneTBB for Emscripten pthreads"
  emcmake cmake -S "${TBB_SOURCE_DIR}" -B "${TBB_BUILD_DIR}" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="${TBB_INSTALL_DIR}" \
    -DBUILD_SHARED_LIBS=OFF \
    -DTBB_TEST=OFF \
    -DTBB_EXAMPLES=OFF \
    -DTBBMALLOC_BUILD=OFF \
    -DTBB_STRICT=OFF \
    -DCMAKE_C_FLAGS="${COMMON_C_FLAGS}" \
    -DCMAKE_CXX_FLAGS="${COMMON_CXX_FLAGS}"

  echo "==> Building and installing oneTBB"
  cmake --build "${TBB_BUILD_DIR}" --target install --parallel "$(nproc)"
fi

if [[ "${WITH_PAPILO}" == "ON" ]]; then
  echo "==> Downloading PaPILO ${PAPILO_VERSION}"
  curl --fail --location --retry 5 --retry-delay 2 --retry-all-errors "${PAPILO_URL}" -o "${PAPILO_SOURCE_ARCHIVE}"
  ACTUAL_PAPILO_SHA256="$(sha256sum "${PAPILO_SOURCE_ARCHIVE}" | awk '{print $1}')"

  if [[ -n "${PAPILO_SHA256}" ]]; then
    echo "==> Verifying PaPILO source archive checksum"
    echo "${PAPILO_SHA256}  ${PAPILO_SOURCE_ARCHIVE}" | sha256sum -c -
  else
    echo "==> Skipping PaPILO checksum verification because PAPILO_SHA256 is empty"
  fi

  echo "==> Extracting PaPILO source"
  mkdir -p "${PAPILO_SOURCE_DIR}" "${PAPILO_BUILD_DIR}" "${PAPILO_INSTALL_DIR}"
  tar -xzf "${PAPILO_SOURCE_ARCHIVE}" -C "${PAPILO_SOURCE_DIR}" --strip-components=1

  PAPILO_CMAKE_ARGS=(
    -S "${PAPILO_SOURCE_DIR}"
    -B "${PAPILO_BUILD_DIR}"
    -G Ninja
    -DCMAKE_BUILD_TYPE=Release
    -DCMAKE_INSTALL_PREFIX="${PAPILO_INSTALL_DIR}"
    -DBUILD_SHARED_LIBS=OFF
    -DBUILD_TESTING=OFF
    "-DBoost_INCLUDE_DIR=${HOST_BOOST_INCLUDE_ROOT}"
    "-DCMAKE_C_FLAGS=${COMMON_C_FLAGS}"
    "-DCMAKE_CXX_FLAGS=${COMMON_CXX_FLAGS}"
    -DGMP=OFF
    -DQUADMATH=OFF
    -DLUSOL=OFF
    "-DTBB=${WITH_TBB}"
    -DSOPLEX=OFF
    -DSCIP=OFF
    -DHIGHS=OFF
    -DGLOP=OFF
    -DGUROBI=OFF
  )

  if [[ "${WITH_TBB}" == "ON" ]]; then
    PAPILO_CMAKE_ARGS+=(
      "-DTBB_DIR=${TBB_CMAKE_DIR}"
    )
  fi

  echo "==> Configuring PaPILO for Emscripten"
  emcmake cmake "${PAPILO_CMAKE_ARGS[@]}"

  echo "==> Building and installing PaPILO"
  cmake --build "${PAPILO_BUILD_DIR}" --target install --parallel "$(nproc)"
fi

SCIP_CMAKE_ARGS=(
  -S "${SOURCE_DIR}"
  -B "${BUILD_DIR}"
  -G Ninja
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_EXECUTABLE_SUFFIX=".js"
  -DCMAKE_EXE_LINKER_FLAGS="${EMSCRIPTEN_LINK_FLAGS[*]}"
  -DCMAKE_C_FLAGS="${COMMON_C_FLAGS}"
  -DCMAKE_CXX_FLAGS="${COMMON_CXX_FLAGS}"
  -DTHREADS_PREFER_PTHREAD_FLAG=ON
  -DCMAKE_HAVE_LIBC_PTHREAD=1
  -DCMAKE_USE_PTHREADS_INIT=1
  -DThreads_FOUND=TRUE
  "-DCMAKE_THREAD_LIBS_INIT=-pthread"
  "-DBoost_INCLUDE_DIR=${HOST_BOOST_INCLUDE_ROOT}"
  "-DBoost_INCLUDE_DIRS=${HOST_BOOST_INCLUDE_ROOT}"
  -DBUILD_SHARED_LIBS=OFF
  -DSHARED=OFF
  -DAUTOBUILD=ON
  -DBUILD_TESTING=OFF
  -DGCG=OFF
  -DUG=OFF
  -DLPS=spx
  -DTPI=none
  -DPAPILO="${WITH_PAPILO}"
  -DZIMPL=OFF
  -DAMPL=OFF
  -DIPOPT=OFF
  -DCONOPT=OFF
  -DWORHP=OFF
  -DLAPACK=OFF
  -DGMP=OFF
  -DMPFR=OFF
  -DLPSEXACT=none
  -DSYM=none
  -DZLIB=OFF
  -DREADLINE=OFF
)

if [[ "${WITH_PAPILO}" == "ON" ]]; then
  SCIP_CMAKE_ARGS+=(
    "-DPAPILO_DIR=${PAPILO_CMAKE_DIR}"
  )
fi

if [[ "${WITH_TBB}" == "ON" ]]; then
  SCIP_CMAKE_ARGS+=(
    "-DTBB_DIR=${TBB_CMAKE_DIR}"
  )
fi

echo "==> Configuring SCIP for Emscripten"
emcmake cmake "${SCIP_CMAKE_ARGS[@]}" 2>&1 | tee "${SCIP_CONFIGURE_LOG}"

ACTUAL_PAPILO="OFF"
SCIP_CONFIG_HEADER="$(find "${BUILD_DIR}" -path "*/scip/config.h" -type f -print -quit)"
if [[ -n "${SCIP_CONFIG_HEADER}" ]] && grep -q "^#define SCIP_WITH_PAPILO" "${SCIP_CONFIG_HEADER}"; then
  ACTUAL_PAPILO="ON"
fi

if [[ "${WITH_PAPILO}" == "ON" && "${ACTUAL_PAPILO}" != "ON" ]]; then
  echo "PaPILO was requested, but SCIP configured with PaPILO support OFF." >&2
  if [[ -n "${SCIP_CONFIG_HEADER}" ]]; then
    echo "Inspected SCIP config header: ${SCIP_CONFIG_HEADER}" >&2
  else
    echo "Could not find the generated SCIP config.h under ${BUILD_DIR}." >&2
  fi
  echo "Check ${SCIP_CONFIGURE_LOG} for the missing dependency or CMake package path." >&2
  exit 1
fi

echo "==> Building SCIP executable"
cmake --build "${BUILD_DIR}" --target scip --parallel "$(nproc)"

SCIP_JS="$(find "${BUILD_DIR}" -name scip.js -type f | head -n 1)"
if [[ -z "${SCIP_JS}" ]]; then
  echo "Could not find generated scip.js under ${BUILD_DIR}" >&2
  exit 1
fi

SCIP_WASM="${SCIP_JS%.js}.wasm"
if [[ ! -f "${SCIP_WASM}" ]]; then
  echo "Could not find generated scip.wasm next to ${SCIP_JS}" >&2
  exit 1
fi

echo "==> Copying bundle to ${OUT_DIR}"
rm -f \
  "${OUT_DIR}/scip.js" \
  "${OUT_DIR}/scip.wasm" \
  "${OUT_DIR}/scip.worker.js" \
  "${OUT_DIR}/scip.wasm.js" \
  "${OUT_DIR}/VERSION.txt"
cp "${SCIP_JS}" "${OUT_DIR}/scip.js"
cp "${SCIP_WASM}" "${OUT_DIR}/scip.wasm"
SCIP_WORKER_JS="${SCIP_JS%.js}.worker.js"
if [[ -f "${SCIP_WORKER_JS}" ]]; then
  cp "${SCIP_WORKER_JS}" "${OUT_DIR}/scip.worker.js"
fi

echo "==> Patching Emscripten UTF-8 decoder for resizable WASM memory"
node - "${OUT_DIR}/scip.js" <<'NODE'
const fs = require('node:fs');

const filePath = process.argv[2];
let text = fs.readFileSync(filePath, 'utf8');
const replacements = [
  [
    'return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))',
    'var bytes=heapOrArray.subarray(idx,endPtr);if(bytes.buffer?.resizable){bytes=bytes.slice()}return UTF8Decoder.decode(bytes)',
  ],
  [
    'return UTF8Decoder.decode(heapOrArray.buffer instanceof ArrayBuffer?heapOrArray.subarray(idx,endPtr):heapOrArray.slice(idx,endPtr))',
    'var bytes=heapOrArray.buffer instanceof ArrayBuffer?heapOrArray.subarray(idx,endPtr):heapOrArray.slice(idx,endPtr);if(bytes.buffer?.resizable){bytes=bytes.slice()}return UTF8Decoder.decode(bytes)',
  ],
];

let patched = false;
for (const [before, after] of replacements) {
  if (text.includes(after)) {
    patched = true;
    break;
  }
  if (text.includes(before)) {
    text = text.replace(before, after);
    fs.writeFileSync(filePath, text);
    patched = true;
    break;
  }
}

if (!patched) {
  console.warn('Could not find a known Emscripten UTF8ArrayToString decode pattern; leaving scip.js unchanged.');
}
NODE

echo "==> Collecting third-party licenses"
/opt/scip-wasm/generate-third-party-licenses.sh \
  "${OUT_DIR}/THIRD_PARTY_LICENSES.txt" \
  "${SOURCE_DIR}" \
  "${PAPILO_SOURCE_DIR}" \
  "${TBB_SOURCE_DIR}" \
  "/emsdk/upstream/emscripten"

ACTUAL_THIRD_PARTY_LICENSES_SHA256="$(sha256sum "${OUT_DIR}/THIRD_PARTY_LICENSES.txt" | awk '{print $1}')"
if [[ -n "${THIRD_PARTY_LICENSES_SHA256}" ]]; then
  echo "==> Verifying third-party license bundle checksum"
  echo "${THIRD_PARTY_LICENSES_SHA256}  ${OUT_DIR}/THIRD_PARTY_LICENSES.txt" | sha256sum -c -
else
  echo "==> Skipping third-party license checksum verification because THIRD_PARTY_LICENSES_SHA256 is empty"
fi

cat > "${OUT_DIR}/VERSION.txt" <<VERSION
SCIP Optimization Suite: ${SCIP_VERSION}
Source: ${SCIP_URL}
SHA256: ${SCIP_SHA256}
Built with: Emscripten $(emcc --version | head -n 1)
PaPILO requested: ${WITH_PAPILO}
PaPILO support: ${ACTUAL_PAPILO}
PaPILO source: $([[ "${WITH_PAPILO}" == "ON" ]] && echo "${PAPILO_URL}" || echo "none")
PaPILO SHA256: ${ACTUAL_PAPILO_SHA256}
Pthreads requested: ${WITH_PTHREADS}
Pthread pool size: $([[ "${WITH_PTHREADS}" == "ON" ]] && echo "${PTHREAD_POOL_SIZE}" || echo "none")
oneTBB requested: ${WITH_TBB}
oneTBB source: $([[ "${WITH_TBB}" == "ON" ]] && echo "${TBB_URL}" || echo "none")
oneTBB SHA256: ${ACTUAL_TBB_SHA256}
Third-party licenses SHA256: ${ACTUAL_THIRD_PARTY_LICENSES_SHA256}
Industrialist native ratio wrapper: ON
Industrialist native ABI: 2
VERSION

echo "==> Running JS/WASM smoke tests"
node /opt/scip-wasm/smoke-test.mjs "${OUT_DIR}" /opt/scip-wasm/smoke-tests

echo "==> Done. New SCIP bundle is in ${OUT_DIR}"
