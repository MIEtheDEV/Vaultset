// The real `server-only` package throws when it is resolved outside a React
// Server Component bundle. Under Jest that guard has nothing to protect, so it
// just makes server modules untestable — this stub stands in for it.
export {};
