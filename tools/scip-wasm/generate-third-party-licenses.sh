#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  echo "Usage: $0 <output> <scip-suite-source> <papilo-source> <onetbb-source> <emscripten-root>" >&2
  exit 1
fi

OUTPUT_FILE="$1"
SCIP_SUITE_SOURCE="$2"
PAPILO_SOURCE="$3"
ONETBB_SOURCE="$4"
EMSCRIPTEN_ROOT="$5"

append_file() {
  local title="$1"
  local file="$2"

  if [[ ! -f "${file}" ]]; then
    echo "Required third-party license file not found: ${file}" >&2
    exit 1
  fi

  {
    printf '\n\n================================================================================\n'
    printf '%s\n' "${title}"
    printf '================================================================================\n\n'
    cat "${file}"
  } >> "${OUTPUT_FILE}"
}

mkdir -p "$(dirname "${OUTPUT_FILE}")"

cat > "${OUTPUT_FILE}" <<'HEADER'
INDUSTRIALIST CALCULATOR SCIP WASM - THIRD-PARTY LICENSES

This file accompanies the compiled files in public/scip. The application code
is licensed separately under the project's MIT License. The components below
remain subject to their respective licenses.

Exact component versions, source archive URLs, checksums, and build options are
recorded in the adjacent VERSION.txt file. That file also tells recipients how
to obtain the corresponding source code, including the EPL-covered CppAD code.

The Apache License 2.0 text below applies to the Apache-licensed components
present in the build, including SCIP, SoPlex, Nauty, tclique, and applicable
LLVM runtime components. It is included once to avoid repeating identical
license text.
HEADER

append_file "Apache License 2.0" "${SCIP_SUITE_SOURCE}/scip/LICENSE"
append_file "CppAD - Eclipse Public License 1.0" "${SCIP_SUITE_SOURCE}/scip/src/cppad/COPYING"
append_file "Nauty copyright and attribution notice" "${SCIP_SUITE_SOURCE}/scip/src/nauty/COPYRIGHT"
append_file "TinyCThread - zlib License" "${SCIP_SUITE_SOURCE}/scip/src/tinycthread/COPYRIGHT"
append_file "dejavu/sassy symmetry preprocessing code - MIT License" "${SCIP_SUITE_SOURCE}/scip/src/dejavu/LICENSE"
append_file "tclique attribution notice" "${SCIP_SUITE_SOURCE}/scip/src/tclique/LICENSE"

if [[ -d "${PAPILO_SOURCE}" ]]; then
  append_file "PaPILO bundled fmt - MIT License" "${PAPILO_SOURCE}/src/papilo/external/fmt/LICENSE.rst"
  append_file "PaPILO bundled pdqsort - zlib License" "${PAPILO_SOURCE}/src/papilo/external/pdqsort/license.txt"
  append_file "PaPILO bundled ska containers - Boost Software License 1.0" "${PAPILO_SOURCE}/src/papilo/external/ska/LICENSE.txt"
fi

if [[ -d "${ONETBB_SOURCE}" ]]; then
  append_file "oneTBB third-party programs and notices" "${ONETBB_SOURCE}/third-party-programs.txt"
fi

append_file "Boost headers - license and copyright notices" "/usr/share/doc/libboost-dev/copyright"

append_file "Emscripten - MIT and University of Illinois/NCSA licenses" "${EMSCRIPTEN_ROOT}/LICENSE"
append_file "Emscripten compiler-rt runtime" "${EMSCRIPTEN_ROOT}/system/lib/compiler-rt/LICENSE.TXT"
append_file "Emscripten musl libc runtime" "${EMSCRIPTEN_ROOT}/system/lib/libc/musl/COPYRIGHT"
append_file "Emscripten libc++ runtime" "${EMSCRIPTEN_ROOT}/system/lib/libcxx/LICENSE.TXT"
append_file "Emscripten libc++abi runtime" "${EMSCRIPTEN_ROOT}/system/lib/libcxxabi/LICENSE.TXT"
append_file "Emscripten libunwind runtime" "${EMSCRIPTEN_ROOT}/system/lib/libunwind/LICENSE.TXT"
append_file "Emscripten LLVM libc runtime" "${EMSCRIPTEN_ROOT}/system/lib/llvm-libc/LICENSE.TXT"
