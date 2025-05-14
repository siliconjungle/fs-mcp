import { SpecServer }          from './generic-spec-server.js';
import fsSpec       from './fs-spec.js';

await new SpecServer(fsSpec).start();
