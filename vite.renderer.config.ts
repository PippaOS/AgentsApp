/* eslint-disable import/no-unresolved */
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig(async () => {
  const react = await import('@vitejs/plugin-react');
  const tailwindcss = await import('@tailwindcss/vite');
  const enableReactCompilerLogs = true;
    // process.env.REACT_COMPILER_LOG === '1' ||
    // process.env.REACT_COMPILER_LOG === 'true';

  return {
    server: {
      watch: {
        ignored: ['**/log.jsonl'],
      },
    },
    plugins: [
      react.default({
        babel: {
          // React Compiler must run first in the Babel plugin pipeline.
          plugins: [
            [
              'babel-plugin-react-compiler',
              enableReactCompilerLogs
                ? {
                    logger: {
                      logEvent(filename: string, event: { kind: string }) {
                        if (event.kind === 'CompileSuccess') {
                          // eslint-disable-next-line no-console
                          console.log(`[react-compiler] compiled ${filename}`);
                        }
                      },
                    },
                  }
                : {},
            ],
          ],
        },
      }),
      tailwindcss.default(),
    ],
  };
});
