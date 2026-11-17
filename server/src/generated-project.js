function toHtmlTitle(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function createGeneratedProjectFiles(pageName, jsx) {
  const title = toHtmlTitle(pageName)

  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'generated-react-page',
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^6.0.5', react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: { autoprefixer: '^10.4.20', postcss: '^8.5.1', tailwindcss: '^3.4.17' },
      }, null, 2) + '\n',
    },
    {
      path: 'tailwind.config.cjs',
      content: "module.exports = {\n  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],\n  theme: { extend: {} },\n  plugins: [],\n}\n",
    },
    {
      path: 'postcss.config.cjs',
      content: "module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n}\n",
    },
    {
      path: 'index.html',
      content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${title}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
    },
    {
      path: 'src/index.css',
      content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n',
    },
    {
      path: 'vite.config.js',
      content: "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n",
    },
    {
      path: 'src/main.jsx',
      content: "import React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport './index.css'\nimport App from './App.jsx'\n\ncreateRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)\n",
    },
    {
      path: 'src/App.jsx',
      content: "import GeneratedPage from './GeneratedPage.jsx'\n\nexport default function App() {\n  return <GeneratedPage />\n}\n",
    },
    {
      path: 'src/GeneratedPage.jsx',
      content: jsx,
    },
  ]
}
