rm -rf dist
echo "Building..."
ng build --configuration production
echo "Deploying..."
firebase deploy
