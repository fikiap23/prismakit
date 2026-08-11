export class ProfileRepository extends defineAppRepo({
  model: 'profile',
  cache: { ttl: 60 },
}) {}
