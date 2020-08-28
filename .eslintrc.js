'use strict';

module.exports = {
    root: true,
    extends: [
        '@hapi/hapi',
        'plugin:@typescript-eslint/eslint-recommended'
    ],
    plugins: [
        '@typescript-eslint'
    ],
    parserOptions: {
        ecmaVersion: 2019
    },
    ignorePatterns: ['/dist/**'],
    overrides: [{
        files: ['lib/**/*.ts'],
        parser: '@typescript-eslint/parser',
        parserOptions: {
            sourceType: 'module'
        }
    }]
};
