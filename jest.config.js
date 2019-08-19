module.exports = {

    preset: 'ts-jest',
    testEnvironment: 'node',

    coveragePathIgnorePatterns: [
        'test/helpers',
    ],

    reporters: [
        "default",
        "jest-junit",
    ],

};

