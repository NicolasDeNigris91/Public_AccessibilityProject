import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      // `react-hooks/set-state-in-effect` was added in eslint-plugin-react-hooks@7
      // (pulled in by eslint-config-next@16). It flags legitimate-but-not-ideal
      // patterns like `useEffect(() => { setTheme(resolveFromLocalStorage()); }, [])`
      // used to hydrate state from a non-SSR-available source. Refactor those to
      // either a lazy useState initializer or a useSyncExternalStore in a
      // follow-up PR, then re-enable. Tracking in the dep-upgrades issue.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
