console.error = (...args) => { fs.appendFileSync('browser_errors.log', args.join(' ') + '
'); originalConsoleError(...args); }
