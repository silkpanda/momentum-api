module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'airbnb-base',
    'airbnb-typescript/base',
    'prettier', // Must be last
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json', // Required for airbnb-typescript
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    // Allows Express apps to use index.ts for routing without default export
    'import/prefer-default-export': 'off', 
    
    // Allows us to name interfaces and types with 'I' or 'T' prefixes if needed
    '@typescript-eslint/naming-convention': 'off', 
    
    // We will manage environment variables in our entry file
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
  },
};