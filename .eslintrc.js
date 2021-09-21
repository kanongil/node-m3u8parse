'use strict';

const EslintPluginHapi = require('@hapi/eslint-plugin');
const TypescriptRules = require('@typescript-eslint/eslint-plugin').rules;


const tsifyRules = function (from) {

    const rules = {};

    for (const rule in from) {
        if (rule === 'no-undef') {
            rules[rule] = 'off';          // Handled by typescript compiler
            continue;
        }

        if (TypescriptRules[rule] && rule !== 'padding-line-between-statements') {
            rules[rule] = 'off';
            rules[`@typescript-eslint/${rule}`] = from[rule];
        }
    }

    return rules;
};


module.exports = {
    root: true,
    extends: [
        'plugin:@hapi/recommended',
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
            ...tsifyRules(EslintPluginHapi.configs.recommended.rules),
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
