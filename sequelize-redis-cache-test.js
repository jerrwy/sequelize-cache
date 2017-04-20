const Cache = require('./sequelize-redis-cache')
const Sequelize = require('sequelize')
const mysql = require('mysql')
const redis = require('redis')

const rc = redis.createClient(6379, 'localhost');
const db = new Sequelize('wechat-backend', 'root', '', { dialect: 'mysql' })


const Cacher = new Cache(db, rc)
  .ttl(60)

Cacher.query('select * from user')
.then((res) =>{
  console.log(res)
})