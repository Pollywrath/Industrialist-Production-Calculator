FROM emscripten/emsdk:6.0.2@sha256:644883f58ca15c38c8be59b3a727ba0eff347729bc31d50a3348a6c9ed92bc07

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    cmake \
    curl \
    file \
    git \
    libboost-dev \
    make \
    ninja-build \
    pkg-config \
    python3 \
    tar \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

COPY tools/scip-wasm/build.sh /opt/scip-wasm/build.sh
COPY tools/scip-wasm/generate-third-party-licenses.sh /opt/scip-wasm/generate-third-party-licenses.sh
COPY tools/scip-wasm/industrialist_ratio_wrapper.cpp /opt/scip-wasm/industrialist_ratio_wrapper.cpp
COPY tools/scip-wasm/smoke-test.mjs /opt/scip-wasm/smoke-test.mjs
COPY tools/scip-wasm/smoke-tests /opt/scip-wasm/smoke-tests

RUN chmod +x /opt/scip-wasm/build.sh /opt/scip-wasm/generate-third-party-licenses.sh

WORKDIR /workspace

ENTRYPOINT ["/opt/scip-wasm/build.sh"]
