var Utils         = require("../../utils")
  , AbstractQuery = require('../abstract/query')

module.exports = (function() {
  var Query = function(database, sequelize, callee, options) {
    this.database = database
    this.sequelize = sequelize
    this.callee = callee
    this.options = Utils._.extend({
      logging: console.log,
      plain: false,
      raw: false
    }, options || {})

    this.checkLoggingOption()
  }
  Utils.inherit(Query, AbstractQuery)

  Query.prototype.getInsertIdField = function() {
    return 'lastID'
  }

  Query.prototype.run = function(sql) {
    var self = this

    this.sql = sql

    if (this.options.logging !== false) {
      this.options.logging('Executing: ' + this.sql)
    }

    var columnTypes = {};
    this.database.serialize(function() {
      var executeSql = function() {
        self.database[getDatabaseMethod.call(self)](self.sql, function(err, results) {
          // allow clients to listen to sql to do their own logging or whatnot
          self.emit('sql', self.sql)
          this.columnTypes = columnTypes;
          err ? onFailure.call(self, err) : onSuccess.call(self, results, this)
        })
      };

      if ((getDatabaseMethod.call(self) === 'all') && /select\s.*?\sfrom\s+([^ ;]+)/i.test(self.sql)) {
        var tableName = RegExp.$1;

        if (tableName !== 'sqlite_master') {
          // get the column types
          self.database.all("PRAGMA table_info(" + tableName + ")", function(err, results) {
            if (!err) {
              for (var i=0, l=results.length; i<l; i++) {
                columnTypes[results[i].name] = results[i].type;
              }
            }
            executeSql();
          });
        } else {
          executeSql();
        }
      } else {
        executeSql();
      }
    })

    return this
  }

  //private

  var getDatabaseMethod = function() {
    if (this.send('isInsertQuery') || this.send('isUpdateQuery')) {
      return 'run'
    } else {
      return 'all'
    }
  }

  var onSuccess = function(results, metaData) {
    var result = this.callee
      , self   = this

    // add the inserted row id to the instance
    if (this.send('isInsertQuery', results, metaData)) {
      this.send('handleInsertQuery', results, metaData)
    }

    if (this.sql.indexOf('sqlite_master') !== -1) {
      result = results.map(function(resultSet) { return resultSet.name })
    } else if (this.send('isSelectQuery')) {
      // we need to convert the timestamps into actual date objects

      if(!this.options.raw) {
        results = results.map(function(result) {
          for (var name in result) {
            if (result.hasOwnProperty(name) && (metaData.columnTypes[name] === 'DATETIME')) {
              result[name] = new Date(result[name]);
            }
          }
          return result
        })
      }

      result = this.send('handleSelectQuery', results)
    } else if (this.send('isShowOrDescribeQuery')) {
      result = results
    }

    this.emit('success', result)
  }

  var onFailure = function(err) {
    this.emit('error', err, this.callee)
  }

  return Query
})()
