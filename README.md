# abc11ty

Auntie Boo Crafts built by 11ty

## run in docker

```shell
docker stop abc && docker rm abc
npm run clean && npm run build
docker run --name abc --volume $(pwd)/_site:/usr/share/nginx/html -p 8081:80 -d nginx
```

## update libraries

```shell
npm i
cp node_modules/bootstrap/dist/css/bootstrap.min.css ./css/
cp node_modules/bootstrap/dist/js/bootstrap.min.js ./js/
cp node_modules/bootstrap-icons/font/bootstrap-icons.min.css ./css/
cp -r node_modules/bootstrap-icons/font/fonts ./css/
```