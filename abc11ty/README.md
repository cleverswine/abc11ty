# abc11ty

Auntie Boo Crafts built by 11ty

## run in docker

```shell
docker stop abc && docker rm abc
npm run clean && npm run build
docker run --name abc --volume $(pwd)/_site:/usr/share/nginx/html -p 8081:80 -d nginx
```