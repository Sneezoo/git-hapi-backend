//'use strict';
var ps = require('child_process');
var path = require('path');
var fs = require('fs');
//var Hapi = require('hapi');
var Boom = require('boom');

const services = {
  "git-upload-pack": {
    "name": "upload-pack",
    "mime": "application/x-git-upload-pack-advertisement",
    "cmd":  "git-upload-pack",
    "mime-req": "application/x-git-upload-pack-request",
    "mime-res": "application/x-git-upload-pack-result",
    "argv": ["--stateless-rpc", "--advertise-refs", "."]
  },
  "git-receive-pack": {
    "name": "receive-pack",
    "mime": "application/x-git-receive-pack-advertisement",
    "cmd":  "git-receive-pack",
    "mime-req": "application/x-git-receive-pack-request",
    "mime-res": "application/x-git-receive-pack-result",
    "argv": ["--stateless-rpc", "."]
   }
};

const isDirectory = function (path) {
  try {
    var stat = fs.statSync(path);
    if(stat.isDirectory())
      return true;
  } catch(e) {
    console.warn(e);
    return false;
  }
  return false;
};
const infoPrelude = function (service) {
  return (function (s) {
    var n=(4+s.length).toString(16);
    return '0000'.substring(0,4-n.length)+n+s;
  })('# service='+service+'\n')+'0000';
};

exports.infoRefsHandler = function (request, reply) {
  var repo = path.join(exports.base, request.params.repo);
  if(!request.query || !request.query.service)
    return reply(Boom.badRequest("No Service requested!"));

  var service = services[request.query.service];
  if(!service)
    return reply(Boom.badRequest("No such service: " + request.query.service));
  var argv = service.argv;

  if (!isDirectory(repo))
    return reply(Boom.notFound("'"+request.repo+"' is not a repository"));

  /*var child = ps.spawnSync(service.cmd, argv, {cwd:repo});
  if(child.error)
    return reply(Boom.internal("Git-Error"));

  var buf = Buffer.concat([
                          new Buffer(infoPrelude(service.cmd)),
                          child.stdout
                          ]);
  */
  var child = ps.spawn(service.cmd, argv, {cwd:repo});
  return reply(child.stdout).type(service.mime);
  //return reply(buf.toString()).type(service.mime);
};

exports.packHandler = function (request, reply) {
  var repo = path.join(exports.base, request.params.repo),
      mime = request.mime,
      service = services[request.params.service];

  if(!service)
    return reply(Boom.badRequest("No such service: " + request.params.service));
  var argv = service.argv;
  if (service["mime-req"] !== mime)
    return reply(Boom.badRequest("Wrong Content-Type: " + mime));

  var child = ps.spawn(service.cmd, argv, {cwd:repo});
  reply(child.stdout).type(service["mime-res"]);
  child.stdin.write(request.payload);
};

exports.register = function (server, options, next) {
  exports.base = options.base || exports.base;
  exports.getanyfile = options.getanyfile || exports.getanyfile;
  fs.mkdir(exports.base, function (err) {
    if(err || err.code !== "EEXIST")
      next(err);
    exports.connection = server.select(options.connection) ||
                         exports.connection ||
                         server.select('git-backend')||
                         server;
    exports.path = options.path ? options.path : '/';
    if(exports.path.slice(-1) != "/" )
      exports.path += "/";
    exports.path += "{repo}.git";
    exports.connection.route({
      method: 'post',
      path: exports.path+"/{service}",
      handler: exports.packHandler,
      config: {
        payload: {
          parse: options.parse ? options.parse : 'gunzip',
          allow: [
          "application/x-git-receive-pack-request",
          "application/x-git-upload-pack-request"
          ]
        }
      }
    });
    exports.connection.route({
      method: 'get',
      path: exports.path+'/info/refs',
      handler: exports.infoRefsHandler
    });
    next();
  });
};

exports.path = null;
exports.base = null;
exports.connection = null;
exports.getanyfile = false;

exports.register.attributes = {
  pkg: require('./package.json')
};
