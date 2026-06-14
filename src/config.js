require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const teamMembers = (process.env.TEAM_MEMBERS || 'John,Maria,Carlos')
  .split(',').map(s => s.trim()).filter(Boolean);

module.exports = {
  port: process.env.PORT || 3000,
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  github: {
    token: required('GITHUB_TOKEN'),
    owner: required('GITHUB_OWNER'),
    repo: required('GITHUB_REPO'),
  },
  teamMembers,
  model: 'claude-haiku-4-5',
};
