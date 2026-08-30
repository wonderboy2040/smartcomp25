// Type declaration shim for bwip-js — the package's exports map uses
// `node` condition which TypeScript's `bundler` resolution sometimes
// fails to resolve. This ambient declaration routes imports to the
// pre-built Node entrypoint types, preserving the CommonJS default
// export (toBuffer, render, etc.).
declare module 'bwip-js' {
  import BwipJs from 'bwip-js/dist/bwip-js-node'
  export = BwipJs
}
