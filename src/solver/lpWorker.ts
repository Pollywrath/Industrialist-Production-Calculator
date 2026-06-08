import { buildMPS } from './lpModel';
import { parseSCIPSolution } from './lpSolution';
import type { LPSolverRequest } from './lpTypes';

interface SCIPRuntime {
  FS: {
    writeFile: (path: string, data: string) => void;
    readFile: (path: string, options: { encoding: 'utf8' }) => string;
    unlink: (path: string) => void;
  };
  main: (args: string[]) => void;
  stdoutLines: string[];
}

let runtimePromise: Promise<SCIPRuntime> | null = null;
let runtimeKey: string | null = null;

function getRuntimeKey(origin: string, version?: string): string {
  return `${origin}::${version ?? ''}`;
}

async function getOrCreateRuntime(origin: string, version?: string): Promise<SCIPRuntime> {
  const nextKey = getRuntimeKey(origin, version);
  if (runtimePromise && runtimeKey === nextKey) {
    return runtimePromise;
  }

  runtimeKey = nextKey;
  runtimePromise = (async () => {
    const versionSuffix = version ? `?v=${version}` : '';
    const scipUrl = `${origin}/scip/scip.js${versionSuffix}`;
    const scipModule = await import(/* @vite-ignore */ scipUrl);
    const createSCIP = scipModule.default;

    const stdoutLines: string[] = [];
    const scip = await createSCIP({
      locateFile: (file: string) => `${origin}/scip/${file}${versionSuffix}`,
      print: (text: string) => {
        stdoutLines.push(text);
      },
      printErr: (text: string) => {
        stdoutLines.push(text);
      },
    });

    return {
      FS: scip.FS,
      main: scip.callMain,
      stdoutLines,
    };
  })();

  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = null;
    runtimeKey = null;
    throw error;
  }
}

self.onmessage = async (event: MessageEvent<LPSolverRequest>) => {
  const { origin, nodes, connections, version } = event.data;

  try {
    const { mpsString, varNameMap } = buildMPS(nodes, connections);

    const { FS, main, stdoutLines } = await getOrCreateRuntime(origin, version);
    stdoutLines.length = 0;

    try {
      FS.unlink('sol.txt');
    } catch {
      void 0;
    }
    FS.writeFile('model.mps', mpsString);

    main(['-c', 'read model.mps', '-c', 'optimize', '-c', 'display solution', '-c', 'quit']);

    const stdoutText = stdoutLines.join('\n');
    let solutionText = '';
    try {
      solutionText = FS.readFile('sol.txt', { encoding: 'utf8' }) as string;
    } catch {
      solutionText = stdoutText;
    }

    const response = parseSCIPSolution(solutionText, varNameMap, connections, nodes);
    self.postMessage(response);

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error('[LP Worker] Run failed:', errorMsg, errorStack);
    self.postMessage({
      feasible: false,
      error: `Worker execution failed: ${errorMsg}`,
    });
  }
};
