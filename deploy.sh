rm -rf dist
echo "Building..."
ng build --configuration production

echo "host Deploying..."
firebase deploy --only hosting

