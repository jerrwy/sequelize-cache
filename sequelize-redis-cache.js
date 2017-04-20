const CircularJSON = require('circular-json')
const crypto = require('crypto')

class Cache {
  constructor(seq,red){
    this.sequelize = seq
    this.redis = red
    this.seconds = 0
    this.options = {}
    this.method = 'find'
    this.cacheHit = false
    this.cachePrefix = 'cacher'
  }

  /**
   * set model
   */
  model(md){
    this.md = this.sequelize.model(md)
    this.modelName = md
    return this
  }

  /**
   * set ttl
   */
  ttl(seconds){
    this.seconds = seconds
    return this
  }

  /**
   * create redis key
   */
  get key(){
    let hash = null
    if(this.q){
      hash = crypto.createHash('sha1')
        .update(this.q)
        .digest('hex')
      return [this.cachePrefix, '__raw__', 'query', hash].join(':')
    }

    hash = crypto.createHash('sha1')
      .update(CircularJSON.stringify(this.options, this.jsonReplacer))
      .digest('hex')
    return [this.cachePrefix, this.modelName, this.method, hash].join(':')
  }

  /**
   * Duct tape to check if this is a sequelize DAOFactory
   */
  jsonReplacer(key, value) {
    if (value && (value.DAO || value.sequelize)) {
      return value.name || ''
    }
    return value
  }


  /**
  * Execute the query and return a promise
  */
  run(options){
    this.options = options || this.options
    return this.fetchFromCache()
  }

  /**
   * fetch data from cache
   */
  fetchFromCache(){
    let self = this
    return new Promise((resolve,reject) =>{
      let key = self.key
      return self.redis.get(key,(err,res) =>{
        if(err) return reject(err)
        if(!res) return self.fetchFromDatabase(key).then(resolve, reject)
        self.cacheHit = true
        try {
          return resolve(JSON.parse(res))
        } catch (e) {
          return reject(e)
        }
      })
    })
  }

  /**
   * fetch data from db
   */
  fetchFromDatabase(){
    let method = this.md[this.method]
    let self = this
    let key = this.key
    this.cacheHit = false
    return new Promise((resolve,reject) =>{
      if(!method) return reject(new Error('Invalid method - ' + self.method))

      //todo:？？？
      return method.call(self.md,self.options)
      .then((results) => {
        let res
        if (!results) {
          res = results
        } else if (Array.isArray(results)) {
          res = results
        } else if (results.toString() === '[object SequelizeInstance]') {
          res = results.get({ plain: true })
        } else {
          res = results
        }

        return self.setCache(key, res, self.seconds)
        .then(
          function good() {
            return resolve(res)
          },
          function bad(err) {
            return reject(err)
          }
        )
      })
    })
  }

  /**
   * Run given manual query
   */
  query(q){
    this.q = q
    return this.rawFromCache()
  }

  /**
   * Fetch data from cache for raw type query
   */
  rawFromCache(){
    let self = this
    return new Promise((resolve,reject) =>{
      let key = self.key
      return self.redis.get(key, (err,res) =>{
        if(err) return reject(err)
        if(!res) return self.rawFromDatabase().then(resolve, reject)
        self.cacheHit = true
        try {
          return resolve(JSON.parse(res))
        } catch (e) {
          return reject(e)
        }
      })
    })
  }

  /**
   * Fetch data from db for raw type query
   */
  rawFromDatabase(){
    let self = this
    let key = self.key
    return new Promise((resolve,reject) =>{
      return self.sequelize.query(self.q,{type:self.sequelize.QueryTypes.SELECT })
      .then((results) => {
        let res
        if (!results) {
          res = results
        } else if (Array.isArray(results)) {
          res = results
        } else if (results.toString() === '[object SequelizeInstance]') {
          res = results.get({ plain: true })
        } else {
          res = results
        }

        return self.setCache(key, res, self.seconds)
        .then(
          function good() {
            return resolve(res)
          },
          function bad(err) {
            return reject(err)
          }
        )
      })
    })
  }

  /**
   * set data in cache
   */
  setCache(key, results, ttl){
    let self = this
    return new Promise((resolve,reject) =>{
      let args = []
      let res
      try {
        res = JSON.stringify(results)
      } catch (e) {
        return reject(e)
      }

      args.push(key, res)
      if (ttl) {
        args.push('EX', ttl)
      }

      return self.redis.set(args, (err, res) =>{
        if (err) return reject(err)
        return resolve(res)
      })
    })
  }

  /**
   * Clear cache with given query
   */
  clearCache(){
    var self = this
    this.options = opts || this.options
    return new Promise((resolve, reject) =>{
      var key = self.key
      return self.redis.del(key, function onDel(err) {
        if (err) return reject(err)
        return resolve()
      })
    })
  }
}

var methods = [
  'find',
  'findOne',
  'findAll',
  'findAndCount',
  'findAndCountAll',
  'all',
  'min',
  'max',
  'sum',
  'count'
]

  /**
   * Add a retrieval method
   */
 function addMethod(key){
    Cache.prototype[key] = () => {
      if (!this.md) return Promise.reject(new Error('Model not set'))
      this.method = key
      //使得run方法内部的this指向Cache的this
      return this.run.apply(this, arguments)
    }
  }

methods.forEach(addMethod)




module.exports = Cache