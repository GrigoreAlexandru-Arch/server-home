openssl req -x509 -new -key /certs/home.key -CA /certs/root-home.crt -CAkey /certs/root-home.key -days 3650 -out /certs/home.crt -config /config/certs.cnf
