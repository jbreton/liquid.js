// Default Tags...
Liquid.Template.registerTag( 'assign', Class.create(Liquid.Tag, {

  tagSyntax: /((?:\(?[\w\-\.\[\]]\)?)+)\s*=\s*((?:"[^"]+"|'[^']+'|[^\s,|]+)+)/,
  
  initialize: function($super, tagName, markup, tokens) {
    var parts = markup.match(this.tagSyntax)
    if( parts ) {
      this.to   = parts[1];
      this.from = parts[2];
    } else {
      throw ("Syntax error in 'assign' - Valid syntax: assign [var] = [source]");
    }
    $super(tagName, markup, tokens)
  },
  render: function(context) {
    context.scopes.last().set( this.to.toString(), context.get(this.from));
    return '';
  }
}));

// Cache is just like capture, but it inserts into the root scope...
Liquid.Template.registerTag( 'cache', Class.create( Liquid.Block, {
  tagSyntax: /(\w+)/,
  
  initialize: function($super, tagName, markup, tokens) {
    var parts = markup.match(this.tagSyntax)
    if( parts ) {
      this.to = parts[1];
    } else {
      throw ("Syntax error in 'cache' - Valid syntax: cache [var]");
    }
    $super(tagName, markup, tokens);
  },
  render: function($super, context) {
    var output = $super(context);
    context.scopes.last()[this.to] = [output].flatten().join('');
    return '';
  }
}));


Liquid.Template.registerTag( 'capture', Class.create(Liquid.Block, {
  tagSyntax: /(\w+)/,
  
  initialize: function($super, tagName, markup, tokens) {
    var parts = markup.match(this.tagSyntax)
    if( parts ) {
      this.to = parts[1];
    } else {
      throw ("Syntax error in 'capture' - Valid syntax: capture [var]");
    }
    $super(tagName, markup, tokens);
  },
  render: function($super, context) {
    var output = $super(context);
    context.set( this.to, [output].flatten().join('') );
    return '';
  }
}));

Liquid.Template.registerTag( 'case', Class.create(Liquid.Block, {

  tagSyntax     : /("[^"]+"|'[^']+'|[^\s,|]+)/,
  tagWhenSyntax : /("[^"]+"|'[^']+'|[^\s,|]+)(?:(?:\s+or\s+|\s*\,\s*)("[^"]+"|'[^']+'|[^\s,|]+.*))?/,
  
  initialize: function($super, tagName, markup, tokens) {
    this.blocks = [];
    this.nodelist = [];
    
    var parts = markup.match(this.tagSyntax)
    if( parts ) {
      this.left = parts[1];
    } else {
      throw ("Syntax error in 'case' - Valid syntax: case [condition]");
    }
    
    $super(tagName, markup, tokens);
  },
  unknownTag: function($super, tag, markup, tokens) {
    switch(tag) {
      case 'when':
        this.recordWhenCondition(markup);
        break;
      case 'else':
        this.recordElseCondition(markup);
        break;
      default:
        $super(tag, markup, tokens);
    }
    
  },
  render: function(context) {
    var self = this,
        output = $A([]),
        execElseBlock = true;

    context.stack(function(){
      for (var i=0; i < self.blocks.length; i++) {
        var block = self.blocks[i];
        if( block.isElse  ) {
          if(execElseBlock == true){ output = $A([output, self.renderAll(block.attachment, context)]).flatten(); }
          return output;
        } else if( block.evaluate(context) ) {
          execElseBlock = false;
          output = $A([output, self.renderAll(block.attachment, context)]).flatten();
        }
      };
    });
    
    return output;
  },
  recordWhenCondition: function(markup) {
    while(markup) {
      var parts = markup.match(this.tagWhenSyntax);
      if(!parts) {
        throw ("Syntax error in tag 'case' - Valid when condition: {% when [condition] [or condition2...] %} ");
      }
      
      markup = parts[2];
      
      var block = new Liquid.Condition(this.left, '==', parts[1]);
      this.blocks.push( block );
      this.nodelist = block.attach([]);
    }
  },
  recordElseCondition: function(markup) {
    if( (markup || '').strip() != '') {
      throw ("Syntax error in tag 'case' - Valid else condition: {% else %} (no parameters) ")
    }
    var block = new Liquid.ElseCondition();
    this.blocks.push(block);
    this.nodelist = block.attach([]);
  }
}));

Liquid.Template.registerTag( 'comment', Class.create(Liquid.Block, {
  render: function(context) {
    return '';
  }
}));

Liquid.Template.registerTag( 'cycle', Class.create(Liquid.Tag, {
  
  tagSimpleSyntax: /"[^"]+"|'[^']+'|[^\s,|]+/,
  tagNamedSyntax:  /("[^"]+"|'[^']+'|[^\s,|]+)\s*\:\s*(.*)/,
  
  initialize: function($super, tag, markup, tokens) {
    var matches, variables;
    // Named first...
    matches = markup.match(this.tagNamedSyntax);
    if(matches) {
      this.variables = this.variablesFromString(matches[2]);
      this.name = matches[1];
    } else {
      // Try simple...
      matches = markup.match(this.tagSimpleSyntax);
      if(matches) {
        this.variables = this.variablesFromString(markup);
        this.name = "'"+ this.variables.toString() +"'";
      } else {
        // Punt
        throw ("Syntax error in 'cycle' - Valid syntax: cycle [name :] var [, var2, var3 ...]");
      }
    }
    $super(tag, markup, tokens);
  },
  
  render: function(context) {
    var self   = this,
        key    = context.get(self.name),
        output = '';

    if(!context.registers['cycle']) {
      context.registers['cycle'] = $H({});
    }
    
    if(!context.registers['cycle'][key]) {
      context.registers['cycle'][key] = 0;
    }
    
    context.stack(function(){
      var iter    = context.registers['cycle'][key],
          results = context.get( self.variables[iter] );
      iter += 1;
      if(iter == self.variables.length){ iter = 0; }
      context.registers['cycle'][key] = iter;
      output = results;
    });
    
    return output;
  },
  
  variablesFromString: function(markup) {
    return markup.split(',').map(function(varname){
      var match = varname.match(/\s*("[^"]+"|'[^']+'|[^\s,|]+)\s*/);
      return (match[1]) ? match[1] : null
    });
  }
}));

Liquid.Template.registerTag( 'for', Class.create( Liquid.Block, {
  tagSyntax: /(\w+)\s+in\s+((?:\(?[\w\-\.\[\]]\)?)+)/,
  
  initialize: function($super, tag, markup, tokens) {
    var matches = markup.match(this.tagSyntax);
    if(matches) {
      this.variableName = matches[1];
      this.collectionName = matches[2];
      this.name = this.variableName +"-"+ this.collectionName;
      this.attributes = $H({});
      var attrmarkup = markup.replace(this.tagSyntax, '');
      var attMatchs = markup.match(/(\w*?)\s*\:\s*("[^"]+"|'[^']+'|[^\s,|]+)/g);
      if(attMatchs) {
        attMatchs.each(function(pair){
          pair = pair.split(":");
          this.attributes.set( pair[0].strip(), pair[1].strip());
        }, this);
      }
    } else {
      throw ("Syntax error in 'for loop' - Valid syntax: for [item] in [collection]");
    }
    $super(tag, markup, tokens);
  },
  
  render: function(context) {
    var self       = this,
        output     = [],
        collection = $A(context.get(this.collectionName) || []),
        range      = [0, collection.length];
    
    if(!context.registers['for']){ context.registers['for'] = $H({}); }
    
    if(this.attributes['limit'] || this.attributes['offset']) {
      var offset   = 0,
          limit    = 0,
          rangeEnd = 0,
          segement = null;
      
      if(this.attributes['offset'] == 'continue') 
        { offset = context.registers['for'][this.name]; }
      else
        { offset = context.get( this.attributes['offset'] ) || 0; }
      
      limit = context.get( this.attributes['limit'] );
      
      rangeEnd = (limit) ? offset + limit + 1 : collection.length;
      range = [ offset, rangeEnd - 1 ];
      
      // Save the range end in the registers so that future calls to 
      // offset:continue have something to pick up
      context.registers['for'][this.name] = rangeEnd;
    }

    // Assumes the collection is an array like object...
    segment = collection.slice(range[0], range[1]);
    if(!segment || segment.length == 0){ return ''; }
    
    context.stack(function(){
      var length = segment.length;
      
      segment.each(function(item, index){
        context.set( self.variableName, item );
        context.set( 'forloop', {
          name:   self.name,
          length: length,
          index:  (index + 1),
          index0: index,
          rindex: (length - index),
          rindex0:(length - index - 1),
          first:  (index == 0),
          last:   (index == (length - 1))
        });
        output.push( (self.renderAll(self.nodelist, context) || []).join('') );
      });
    });
    
    return [output].flatten().join('');
  }
}));

Liquid.Template.registerTag( 'if', Class.create(Liquid.Block, {
  
  tagSyntax: /("[^"]+"|'[^']+'|[^\s,|]+)\s*([=!<>a-z_]+)?\s*("[^"]+"|'[^']+'|[^\s,|]+)?/,
  
  initialize: function($super, tag, markup, tokens) {
    this.nodelist = [];
    this.blocks = [];
    this.pushBlock('if', markup);
    $super(tag, markup, tokens);
  },
  
  unknownTag: function($super, tag, markup, tokens) {
    if( $A(['elsif', 'else']).include(tag) ) {
      this.pushBlock(tag, markup);
    } else {
      $super(tag, markup, tokens);
    }
  },
  
  render: function(context) {
    var self = this,
        output = '';
    context.stack(function(){
      for (var i=0; i < self.blocks.length; i++) {
        var block = self.blocks[i];
        if( block.evaluate(context) ) {
          output = self.renderAll(block.attachment, context);
          return;
        }
      };
    })
    return [output].flatten().join('');
  },
  
  pushBlock: function(tag, markup) {
    var block;
    if(tag == 'else') {
      block = new Liquid.ElseCondition();
    } else {
      var expressions = markup.split(/\b(and|or)\b/).reverse(),
          expMatches  = expressions.shift().match( this.tagSyntax );
      
      if(!expMatches){ throw ("Syntax Error in tag '"+ tag +"' - Valid syntax: "+ tag +" [expression]"); }
      
      var condition = new Liquid.Condition(expMatches[1], expMatches[2], expMatches[3]);
      
      while(expressions.length > 0) {
        var operator = expressions.shift(),
            expMatches  = expressions.shift().match( this.tagSyntax );
        if(!expMatches){ throw ("Syntax Error in tag '"+ tag +"' - Valid syntax: "+ tag +" [expression]"); }

        var newCondition = new Liquid.Condition(expMatches[1], expMatches[2], expMatches[3]);
        newCondition[operator](condition);
        condition = newCondition;
      }
      
      block = condition;
    }
    block.attach($A([]));
    this.blocks.push(block);
    this.nodelist = block.attachment;
  }
}));

Liquid.Template.registerTag( 'ifchanged', Class.create( Liquid.Block, {

  render: function(context) {
    var self = this,
        output = '';
    context.stack(function(){
      var results = self.renderAll(self.nodelist, context).join('');
      if(results != context.registers['ifchanged']) {
        output = results;
        context.registers['ifchanged'] = output;
      }
    });
    return output;
  }
}));

Liquid.Template.registerTag( 'include', Class.create( Liquid.Tag, {
  
  tagSyntax: /((?:"[^"]+"|'[^']+'|[^\s,|]+)+)(\s+(?:with|for)\s+((?:"[^"]+"|'[^']+'|[^\s,|]+)+))?/,
  
  initialize: function($super, tag, markup, tokens) {
    var matches = (markup || '').match(this.tagSyntax);
    if(matches) {
      this.templateName = matches[1];
      this.templateNameVar = this.templateName.substring(1, this.templateName.length - 1);
      this.variableName = matches[3];
      this.attributes = $H({});

      var attMatchs = markup.match(/(\w*?)\s*\:\s*("[^"]+"|'[^']+'|[^\s,|]+)/g);
      if(attMatchs) {
        attMatchs.each(function(pair){
          pair = pair.split(":");
          this.attributes.set( pair[0].strip(), pair[1].strip() );
        }, this);
      }
    } else {
      throw ("Error in tag 'include' - Valid syntax: include '[template]' (with|for) [object|collection]");
    }
    $super(tag, markup, tokens);
  },

  render: function(context) {
    var self     = this,
        source   = Liquid.readTemplateFile( context.get(this.templateName) ),
        partial  = Liquid.parse(source),
        variable = context.get((this.variableName || this.templateNameVar)),
        output   = '';
    context.stack(function(){
      self.attributes.each(function(pair){
        context.set(pair.key, context.get(pair.value));
      })

      if(variable instanceof Array) {
        output = variable.map(function(variable){
          context.set( self.templateNameVar, variable );
          return partial.render(context);
        });
      } else {
        context.set(self.templateNameVar, variable);
        output = partial.render(context);
      }
    });
    output = [output].flatten().join('');
    return output
  }
}));

Liquid.Template.registerTag( 'unless', Class.create(Liquid.Template.tags['if'], {

  render: function(context) {
    var self = this,
        output = '';
    context.stack(function(){
      // The first block is called if it evaluates to false...
      var block = self.blocks[0];
      if( !block.evaluate(context) ) {
        output = self.renderAll(block.attachment, context);
        return;
      }
      // the rest are the same..
      for (var i=1; i < self.blocks.length; i++) {
        var block = self.blocks[i];
        if( block.evaluate(context) ) {
          output = self.renderAll(block.attachment, context);
          return;
        }
      };
    })
    return output;
  }
}));