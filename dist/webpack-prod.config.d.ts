declare const path: any;
declare const nodeExternals: any;
declare const config: {
    target: string;
    entry: string;
    output: {
        path: any;
        globalObject: string;
        filename: string;
        libraryTarget: string;
        devtoolModuleFilenameTemplate: string;
    };
    devtool: string;
    externalsPresets: {
        node: boolean;
    };
    externals: any[];
    resolve: {
        mainFields: string[];
        extensions: string[];
        alias: {};
        fallback: {};
        modules: string[];
    };
    module: {
        rules: {
            test: RegExp;
            exclude: RegExp;
            use: {
                loader: string;
            }[];
        }[];
    };
};
