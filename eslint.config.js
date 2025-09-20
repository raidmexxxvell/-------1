// ESLint configuration (flat config format)
export default [
  {
    files: ["static/js/**/*.js"],
    ignores: ["static/js/dist/**/*"],
  languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script", // Legacy JS files
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
  fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        location: "readonly",
  URL: "readonly",
        URLSearchParams: "readonly",
        FormData: "readonly",
        WebSocket: "readonly",
        EventSource: "readonly",
  CustomEvent: "readonly",
  Image: "readonly",
  MutationObserver: "readonly",
  IntersectionObserver: "readonly",
  performance: "readonly",
  requestAnimationFrame: "readonly",
  getComputedStyle: "readonly",
  Notification: "readonly",
  alert: "readonly",
  confirm: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        // Project-specific globals
        io: "readonly", // Socket.IO client
        UserStore: "readonly",
        UIStore: "readonly",
        LeagueStore: "readonly",
        MatchesStore: "readonly",
        OddsStore: "readonly",
        PredictionsStore: "readonly",
        ShopStore: "readonly",
        ProfileStore: "readonly",
        RealtimeStore: "readonly",
        StoreDebugger: "readonly",
        AdminLogger: "readonly",
        fetchEtag: "readonly",
        fetchEtagUtils: "readonly",
        // Legacy globals from various modules
        MatchState: "readonly",
        XPUtils: "readonly", 
        getTeamColor: "readonly",
        ensureBettingToursFresh: "readonly",
        updateOddsUIFromStore: "readonly",
        loadReferralInfo: "readonly",
        closeLeagueShelf: "readonly",
        initApp: "readonly",
        module: "writable", // CommonJS modules
        prompt: "readonly" // Browser prompt dialog
      }
    },
    rules: {
      // Error Prevention
      "no-unused-vars": ["error", { 
        vars: "all", 
        args: "after-used", 
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_"
      }],
      "no-undef": "error",
      "no-unreachable": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      
      // DOM Manipulation Safety
      "no-global-assign": "error",
      "no-implicit-globals": "error",
      
      // Event Handling - Prevent Memory Leaks
      "no-inner-declarations": "error",
      
      // Memory Leaks Prevention
      "no-implied-eval": "error",
      "no-eval": "error",
      
      // DOM Event Safety Rules
      "no-script-url": "error", // Prevent javascript: URLs
      
      // Best Practices
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "no-var": "error",
      "prefer-const": "error",
      "no-duplicate-imports": "error",
      
      // DOM-specific warnings (not using no-alert/no-confirm as they're not available)
      "no-script-url": "error", // Prevent javascript: URLs
    }
  },
  {
    files: ["static/js/**/*.ts"],
    ignores: ["static/js/dist/**/*"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        location: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        FormData: "readonly",
        WebSocket: "readonly",
        EventSource: "readonly",
        CustomEvent: "readonly",
        Image: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        getComputedStyle: "readonly",
        Notification: "readonly",
        alert: "readonly",
        confirm: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        // Project-specific globals
        io: "readonly", // Socket.IO client
        UserStore: "readonly",
        UIStore: "readonly",
        LeagueStore: "readonly",
        MatchesStore: "readonly",
        OddsStore: "readonly",
        PredictionsStore: "readonly",
        ShopStore: "readonly",
        ProfileStore: "readonly",
        RealtimeStore: "readonly",
        StoreDebugger: "readonly",
        AdminLogger: "readonly",
        fetchEtag: "readonly",
        fetchEtagUtils: "readonly",
        // Legacy globals from various modules
        MatchState: "readonly",
        XPUtils: "readonly", 
        getTeamColor: "readonly",
        ensureBettingToursFresh: "readonly",
        updateOddsUIFromStore: "readonly",
        loadReferralInfo: "readonly",
        closeLeagueShelf: "readonly",
        initApp: "readonly",
        module: "writable", // CommonJS modules
        prompt: "readonly" // Browser prompt dialog
      }
    },
    rules: {
      // Error Prevention
      "no-unused-vars": ["error", { 
        vars: "all", 
        args: "after-used", 
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_"
      }],
      "no-undef": "error",
      "no-unreachable": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      
      // DOM Manipulation Safety
      "no-global-assign": "error",
      "no-implicit-globals": "error",
      
      // Event Handling - Prevent Memory Leaks
      "no-inner-declarations": "error",
      
      // Memory Leaks Prevention
      "no-implied-eval": "error",
      "no-eval": "error",
      
      // DOM Event Safety Rules
      "no-script-url": "error",
      
      // Best Practices
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "no-var": "error",
      "prefer-const": "error",
      "no-duplicate-imports": "error"
    }
  },
  {
    files: ["static/js/helpers.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { 
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_"
      }]
    }
  },
  {
    files: ["static/js/store/**/*.js", "static/js/store/**/*.ts"],
    rules: {
      // Stricter rules for store modules
      "no-console": ["error", { allow: ["warn", "error"] }],
      
      // Store-specific DOM safety
      "no-global-assign": "error",
      "no-implicit-globals": "error"
    }
  },
  {
    files: ["static/js/admin*.js", "static/js/profile-*.js"],
    rules: {
      // Admin and profile modules can use console for debugging
      "no-console": "off"
    }
  },
  {
    files: ["static/js/**/realtime-*.js", "static/js/**/etag-*.js"],
    rules: {
      // Network modules - stricter event handling
      "no-global-assign": "error",
      "no-implicit-globals": "error"
    }
  }
];