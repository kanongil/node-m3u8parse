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
        'plugin:@hapi/recommended'
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020
    },
    ignorePatterns: ['lib/**', 'test/*.js'],
    overrides: [{
        files: ['**/*.ts'],
        extends: [
            'plugin:@typescript-eslint/recommended'
        ],
        parserOptions: {
            sourceType: 'module',
            project: './**/tsconfig.json',
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
