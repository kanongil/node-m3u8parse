'use strict';

const EslintConfigHapi = require('@hapi/eslint-config-hapi');
const TypescriptRules = require('@typescript-eslint/eslint-plugin').rules;


const tsifyRules = function (from) {

    const rules = {};

    for (const rule in from) {
        if (TypescriptRules[rule]) {
            rules[rule] = 'off';
            rules[`@typescript-eslint/${rule}`] = from[rule];
        }
    }

    return rules;
};


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
    ignorePatterns: ['/lib/**/*.js', '/lib/**/*.d.ts'],
    overrides: [{
        files: ['lib/**/*.ts'],
        extends: [
            'plugin:@typescript-eslint/recommended'
        ],
        parser: '@typescript-eslint/parser',
        parserOptions: {
            sourceType: 'module',
            project: './tsconfig.json',
            tsconfigRootDir: __dirname
        },
        rules: {
            ...tsifyRules(EslintConfigHapi.rules),
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',

            '@typescript-eslint/member-delimiter-style': 'warn',
            '@typescript-eslint/no-throw-literal': 'error',
            '@typescript-eslint/prefer-for-of': 'warn',
            '@typescript-eslint/type-annotation-spacing': 'warn',
            '@typescript-eslint/unified-signatures': 'warn'
        }
    }]
};
