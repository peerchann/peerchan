# Gladden
Server node and rendering engine for distributed imageboard browsing.
Participate in a distributed imageboard and share posts and files with peers.
Runs a [Peerbit](https://github.com/dao-xyz/peerbit) node and serves pages to you locally in your browser.
![Screenshot](screenshots/screenshot01.png)

## Prerequisites
Node.js (at least v18.9.0) and a package manager like yarn (reccomended) or npm.

## License
GNU AGPLv3, see [LICENSE](LICENSE).

## Installation
to install dependencies:

```bash
yarn install
```

to run:

```bash
yarn start
 ```

 If you'd like to daemonize the process so it starts on boot, make sure pm2 is installed globally and then:

```bash
pm2 start dist/server.js --name gladden
pm2 startup
<copy-paste the command displayed>
pm2 save
 ```

