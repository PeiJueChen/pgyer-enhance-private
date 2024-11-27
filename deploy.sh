rm -rf dist
echo "Building..."
npm run build
echo "Deploying..."
firebase deploy
