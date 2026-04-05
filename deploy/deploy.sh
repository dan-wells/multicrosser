#!/usr/bin/env sh
# Run this script on the production server from /var/www/multicrosser
# to pull and deploy the latest changes.
#
# Usage:
#   cd /var/www/multicrosser
#   sh deploy/deploy.sh

set -e

echo "== Pulling latest code =="
git pull

echo "== Installing Ruby dependencies =="
bundle install

echo "== Installing JavaScript dependencies =="
yarn install

echo "== Building JavaScript =="
RAILS_ENV=production yarn build

echo "== Precompiling assets =="
RAILS_ENV=production bundle exec rails assets:precompile

echo "== Clearing caches =="
bundle exec rails log:clear tmp:clear

echo "== Restarting app server =="
systemctl restart multicrosser-web

echo "== Done =="
