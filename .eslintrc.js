'use strict';

module.exports = {
    root: true,
    extends: [
        '@hapi/eslint-config-hapi',
        'plugin:@typescript-eslint/eslint-recommended'
    ],
    plugins: [
        '@typescript-eslint'
    ],
    parserOptions: {
        ecmaVersion: 2019
    },
    ignorePatterns: ['/dist/**'],
    overrides: [
        {
            files: ['**/*.ts'],
            parser: '@typescript-eslint/parser',
            parserOptions: {
                sourceType: 'module'
            }
        }
    ]

};
