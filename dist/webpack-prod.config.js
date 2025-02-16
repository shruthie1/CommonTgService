'use strict';
const path = require('path');
const nodeExternals = require('webpack-node-externals');
const config = {
    target: 'node',
    entry: './src/main.ts',
    output: {
        path: path.resolve(__dirname, 'out'),
        globalObject: "this",
        filename: 'index.js',
        libraryTarget: 'commonjs',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    devtool: 'source-map',
    externalsPresets: { node: true },
    externals: [nodeExternals()],
    resolve: {
        mainFields: ['module', 'main'],
        extensions: ['.ts', '.js'],
        alias: {},
        fallback: {},
        modules: ['node_modules']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    }
};
module.exports = config;
//# sourceMappingURL=webpack-prod.config.js.map