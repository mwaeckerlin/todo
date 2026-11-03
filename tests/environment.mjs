import { existsSync } from 'node:fs';
import path from 'node:path';
export function testEnvironment(input=process.env){
  const file=input.TODO_IMPORT_FILE??(existsSync('artifacts/import-TODO.md')?'artifacts/import-TODO.md':undefined);
  return {...input,...(file?{TODO_IMPORT_FILE:path.resolve(file)}:{}),CARGO_BUILD_JOBS:input.CARGO_BUILD_JOBS??'2',BIND_ADDRESS:'127.0.0.1',TODO_DATABASE_URL:'postgres://todo:local-test-database@database/todo'};
}
