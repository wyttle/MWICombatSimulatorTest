const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

// worker 通过 new URL(..., import.meta.url) 创建，'auto' 让 worker 依据自身脚本地址解析同级分包；
// 写死 '/' 会让 worker 内部的 importScripts 拼出非法地址。部署到子路径时仍用 PUBLIC_PATH 覆盖。
const publicPath = process.env.PUBLIC_PATH || 'auto';
// index.html 里的静态资源前缀只在显式指定 PUBLIC_PATH 时才重写。
const htmlAssetPrefix = process.env.PUBLIC_PATH || '/';
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: publicPath,
    clean: true,
  },
  mode: isProduction ? 'production' : 'development',
  devtool: isProduction ? false : 'source-map',
  optimization: {
    // worker 与主包共享大量模拟器代码；拆包会让 worker 去 importScripts 公共块，
    // 在 blob/worker 作用域里解析不出来。这里直接禁用拆包。
    splitChunks: false,
    minimize: isProduction,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: false,
            drop_debugger: true,
            pure_funcs: ['console.log'],
          },
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
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
            let html = content.toString();
            // js/ 下的脚本不参与打包，文件名固定，浏览器会一直用缓存副本。
            // 用内容 hash 做查询串，改了才失效；i18n.js 还会把这个串转发给 locales 请求。
            html = html.replace(/src="js\/([^"?]+\.js)"/g, (match, file) => {
              const asset = path.resolve(__dirname, 'js', file);
              if (!fs.existsSync(asset)) return match;
              const hash = crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex').slice(0, 8);
              return `src="js/${file}?v=${hash}"`;
            });
            // Replace paths in index.html based on PUBLIC_PATH environment variable
            if (htmlAssetPrefix !== '/') {
              html = html.replace(/src="js\//g, `src="${htmlAssetPrefix}js/`);
              html = html.replace(/src="bundle\.js"/g, `src="${htmlAssetPrefix}bundle.js"`);
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
