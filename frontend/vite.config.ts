import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: './', plugins: [react()], build: { sourcemap: false, rollupOptions:{output:{onlyExplicitManualChunks:true,manualChunks(id){
  if(!id.includes('node_modules'))return;
  if(id.includes('/katex/'))return 'math-renderer';
  if(/\/@(?:codemirror\/(?:state|view|commands|language|autocomplete|search|lint)|lezer\/(?:common|lr|highlight))\//.test(id))return 'code-editor';
  if(id.includes('/prosemirror-'))return 'text-model';
  if(id.includes('/@vue/')||id.includes('/vue/'))return 'editor-widgets';
  if(id.includes('/@milkdown/'))return 'formatted-editor';
  if(/\/(?:unified|remark[^/]*|rehype[^/]*|micromark[^/]*|mdast[^/]*|hast[^/]*|unist[^/]*|vfile[^/]*)\//.test(id))return 'markdown';
  if(/\/node_modules\/(?:react|react-dom|scheduler|use-sync-external-store)\//.test(id))return 'react';
}}} } });
