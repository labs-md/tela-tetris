'use strict';
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const base = path.resolve(__dirname, '../connectors/planner/vendor/ui-sdk');
const core = path.join(base, 'core');
const metadata = JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf8'));
esbuild.build({
  logLevel:'silent',
  entryPoints:[path.join(__dirname,'../connectors/planner/ui-entry.js')],
  outfile:path.join(__dirname,'../connectors/planner/ui-sdk.js'),
  bundle:true, format:'iife', minify:true, target:['es2022'], legalComments:'eof',
  plugins:[{name:'vendored-ui-sdk',setup(build){
    build.onResolve({filter:/^@ui-sdk\/core(?:\/.*)?$/},args=>{
      const key=args.path==='@ui-sdk/core'?'.':'.'+args.path.slice('@ui-sdk/core'.length);
      const target=metadata.exports[key];
      if(typeof target!=='string')throw new Error('Unknown SDK entry: '+args.path);
      return {path:path.join(core,target)};
    });
    build.onResolve({filter:/^#(?:dev|name-check)$/},args=>({path:path.join(core,metadata.imports[args.path].default)}));
  }}],
}).then(()=>console.log('Built the local UI SDK bundle.')).catch(error=>{
  for(const issue of error.errors||[])console.error(issue.text);
  process.exitCode=1;
});
