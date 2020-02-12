module.exports = {
    hooks: {
        'pre-commit': 'TZ=utc NODE_ICU_DATA=node_modules/full-icu lint-staged',
    },
};
