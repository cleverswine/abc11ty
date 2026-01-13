# abc11ty

Auntie Boo Crafts built by 11ty

```shell
# update listings
node gen.js
npm run build

# update bootstrap
cp ./node_modules/bootstrap/dist/css/bootstrap.min.css ./css/
cp ./node_modules/bootstrap/dist/js/bootstrap.min.js ./js/
cp ./node_modules/bootstrap-icons/font/fonts/* ./css/fonts/

# run locally
npm run serve

# rebuild site
git add --all
git commit -m "updates"
git push
```
