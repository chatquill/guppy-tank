// Lets Node run the game's TypeScript directly: resolves extensionless imports to .ts files.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) {
            const url = new URL(specifier + '.ts', context.parentURL);
            if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
        }
        return nextResolve(specifier, context);
    },
});
