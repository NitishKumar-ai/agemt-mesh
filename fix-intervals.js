import fs from 'fs';

let content = fs.readFileSync('mysql-persistence/src/MySQLQueueDAO.ts', 'utf-8');

// Replace: current_timestamp + (${offsetTimeInSecond} || ' seconds')::interval
content = content.replace(/sql`current_timestamp \+ \(\$\{([a-zA-Z0-9_]+)\} \|\| ' seconds'\)::interval`/g, 'sql`CURRENT_TIMESTAMP + INTERVAL \\${$1} SECOND`');
content = content.replace(/sql<Date>`current_timestamp \+ \(\$\{([a-zA-Z0-9_]+)\} \|\| ' seconds'\)::interval`/g, 'sql<Date>`CURRENT_TIMESTAMP + INTERVAL \\${$1} SECOND`');
content = content.replace(/sql<Date>`current_timestamp \+ interval '1000 microseconds'`/g, "sql<Date>`CURRENT_TIMESTAMP + INTERVAL 1000 MICROSECOND`");
content = content.replace(/sql<Date>`current_timestamp - interval '60 seconds'`/g, "sql<Date>`CURRENT_TIMESTAMP - INTERVAL 60 SECOND`");
content = content.replace(/sql`CURRENT_TIMESTAMP \+ interval '\$\{timeout\} millisecond'`/g, "sql`CURRENT_TIMESTAMP + INTERVAL \\${timeout} MILLISECOND`");
content = content.replace(/interval '\$\{timeout\} millisecond'/g, "INTERVAL \\${timeout} MILLISECOND");


fs.writeFileSync('mysql-persistence/src/MySQLQueueDAO.ts', content);
