const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const publicPath = process.env.PUBLIC_PATH || '/';

module.exports = {
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: publicPath,
    clean: true,
  },
  mode: 'development',
  devtool: 'source-map',
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 9000,
    open: true,
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, 'patchNote.json'), to: 'patchNote.json' },
        {
          from: path.resolve(__dirname, 'index.html'),
          to: 'index.html',
          transform(content) {
            // Replace paths in index.html based on PUBLIC_PATH environment variable
            let html = content.toString();
            if (publicPath !== '/') {
              html = html.replace(/src="js\//g, `src="${publicPath}js/`);
              html = html.replace(/src="bundle\.js"/g, `src="${publicPath}bundle.js"`);
            }
            return html;
          }
        },
        { from: path.resolve(__dirname, 'js'), to: 'js' },
        { from: path.resolve(__dirname, 'locales'), to: 'locales' },
        { from: path.resolve(__dirname, 'src/external/jigs.js'), to: 'jigs.js' }
      ],
    }),
  ],
};
