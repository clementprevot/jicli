module.exports = {
    '*.js': ['eslint --max-warnings=0', 'prettier --write', 'jest --findRelatedTests'],
    '*.{js,json,md,yml}': ['prettier --write'],
};
