module.exports = {
    extends: ['airbnb-base', 'prettier', 'prettier/vue'],
    env: {
        jest: true,
    },
    plugins: ['jest'],
    rules: {
        'no-await-in-loop': 'off',
        'no-param-reassign': [
            'error',
            {
                props: true,
                ignorePropertyModificationsFor: ['state'],
            },
        ],
        'prefer-destructuring': [
            'error',
            {
                VariableDeclarator: {
                    array: true,
                    object: true,
                },
                // Prevent assignment expressions to be considered as wrong implementations. For example,
                // instead of writting `[this.item] = array`, we'll have to keep `this.item = array[O]`.
                AssignmentExpression: {
                    array: false,
                    object: false,
                },
            },
            {
                enforceForRenamedProperties: false,
            },
        ],
        'import/extensions': ['error', 'never'],
        'import/no-extraneous-dependencies': [
            'error',
            {
                packageDir: ['.'],
            },
        ],
        // We thought this rule was too invasive, and we would have to disable it quite often. So, let's
        // disable it globally so we don't have `eslint-disable` comments all over the code.
        'import/prefer-default-export': 'off',

        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'warn',
    },
    parserOptions: {
        parser: 'babel-eslint',
    },
};
