import { defineAppRepo } from './define-app-repo.js';

export class UserRepository extends defineAppRepo({
  model: 'user',
  cache: true,
}) {}
