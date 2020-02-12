const plugins = [
    '@babel/plugin-proposal-nullish-coalescing-operator',
    '@babel/plugin-proposal-optional-catch-binding',
    '@babel/plugin-proposal-optional-chaining',
];
const presets = [
    [
        '@babel/env',
        {
            corejs: { version: 3, proposals: true },
            shippedProposals: true,
            targets: { node: 'current' },
            useBuiltIns: 'usage',
        },
    ],
];

module.exports = { plugins, presets };
