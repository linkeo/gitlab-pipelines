const gulp = require('gulp');
const yaml = require('gulp-yaml');
require('webpack/');
const rm = require('gulp-rm');
const changed = require('gulp-changed');
const webpack = require('webpack');
const webpackStream = require('webpack-stream');
const named = require('vinyl-named');
const autoprefixer = require('autoprefixer');
const VueLoaderPlugin = require('vue-loader/lib/plugin');

const webpackConfig = {
  output: {
    filename: '[name].js',
  },
  devtool: 'cheap-module-source-map',
  module: {
    rules: [{
      test: /\.js$/,
      exclude: /(node_modules|bower_components)/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env'],
          plugins: [
            ['@babel/plugin-transform-runtime', { polyfill: false, regenerator: true }],
          ],
        },
      },
    }, {
      test: /\.vue$/,
      loader: 'vue-loader',
    }, {
      test: /\.less$/,
      use: [
        'style-loader',
        { loader: 'css-loader' },
        { loader: 'postcss-loader', options: { plugins: [autoprefixer()] } },
        { loader: 'less-loader' },
      ],
    }, {
      test: /\.css$/,
      use: [
        'style-loader',
        { loader: 'css-loader' },
        { loader: 'postcss-loader', options: { plugins: [autoprefixer()] } },
      ],
    }, {
      test: /\.(?:ttf|woff)$/,
      loader: 'file-loader',
      options: {
        name: '[name].[hash:8].[ext]',
        outputPath: '/assets/loaded',
      },
    }],
  },
  plugins: [
    new VueLoaderPlugin(),
  ],
};

const buildManifest = () => gulp.src('./manifest.yml')
  .pipe(changed('./dist/'))
  .pipe(yaml({ space: 2, safe: true }))
  .pipe(gulp.dest('./dist/'));

const copyAssets = () => gulp.src('./src/assets/**')
  .pipe(changed('./dist/assets/'))
  .pipe(gulp.dest('./dist/assets/'));

const copyPages = () => gulp.src('./src/**/*.html')
  .pipe(changed('./dist/'))
  .pipe(gulp.dest('./dist/'));

const buildScript = () => gulp.src([
  './src/popup.js',
  './src/background.js',
])
  .pipe(named())
  .pipe(webpackStream(Object.assign({}, webpackConfig, { mode: 'production', watch: false }), webpack))
  .pipe(gulp.dest('./dist/'));

const clean = () => gulp.src('./dist/**/*', { read: false }).pipe(rm({ async: false }));

const dev = () => {
  gulp.watch('./manifest.yml', gulp.series(['buildManifest']));
  gulp.watch('./src/assets/**', gulp.series(['copyAssets']));
  gulp.watch('./src/**/*.html', gulp.series(['copyPages']));
  return gulp.src([
    './src/popup.js',
    './src/background.js',
  ])
    .pipe(named())
    .pipe(webpackStream(Object.assign({}, webpackConfig, { mode: 'development', watch: true }), webpack))
    .pipe(gulp.dest('./dist/'));
};

gulp.task('clean', clean);
gulp.task('buildManifest', buildManifest);
gulp.task('copyPages', copyPages);
gulp.task('copyAssets', copyAssets);
gulp.task('buildScript', buildScript);
gulp.task('default', gulp.series('clean', 'buildManifest', 'copyAssets', 'copyPages', 'buildScript'));
gulp.task('dev', dev);
