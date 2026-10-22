// The bare path below resolves against the page in a browser, and against this file's directory in the gate.
fetch('assets/data.json').then(function (r) { return r.json(); });
