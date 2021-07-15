const EOF = Symbol("EOF")

let letterReg = /^[a-zA-Z]$/
let spaceReg = /^[\t\n\f ]$/


class HTMLParser {
    constructor() {
        // always points to current parsing token
        this.currentToken = null
        this.currentAttribute = null

        // we use a stack to manage depth first search of dom
        // element: {type ... children ... attributes ...}
        this.stack = [{ type: "document", children: [] }];

        this.currentTextNode = null;
    }



    parse = (s) => {
        let state = this._data
        for (let c of s) {
            state = state(c)
        }
        state(EOF)
        return this.stack[0]
    }

    // digest html data
    _data = (c) => {
        // tag start, end of html file or text node
        if (c === "<") { return this._tagOpen }
        if (c === EOF) {
            this._push_token({
                type: "EOF",
            })
            return;
        }
        // text node
        this._push_token({
            type: "text",
            value: c,
        })
        return this._data
    }

    _push_token = (token) => {

        // get top of the stack is current elemenet's context(parent)
        let top = this.stack[this.stack.length - 1];
        if (token.type === "startTag") {

            // create element and push it to the stack
            let element = {
                type: "element",
                attributes: [],
                children: [],
            }

            element.tagName = token.tagName;

            // add in all attributes
            for (let k in token) {
                if (k !== "type" && k !== "tagName") {
                    element.attributes.push({
                        name: k,
                        value: token[k],
                    })
                }
            }

            top.children.push(element);
            element.parent = top;

            // is selfclosing we then should not push to stack(cause it ends directly)
            if (!token.isSelfClosing) {
                this.stack.push(element)
            }
            this.currentTextNode = null
            return;
        }
        if (token.type === "endTag") {
            if (token.tagName !== top.tagName) {
                throw new Error(`token tag name ${token.tagName} not equal to ${top.tagName}`)
            }
            this.stack.pop()
            this.currentTextNode = null
            return
        }
        if (token.type === "text") {
            if (this.currentTextNode === null) {
                this.currentTextNode = {
                    type: "text",
                    value: "",
                }
                top.children.push(this.currentTextNode)
            }
            this.currentTextNode.value += token.value
        }
    }


    // allowed next: / and letter
    _tagOpen = (c) => {
        if (c === "/") return this._endTagOpen
        if (c.match(letterReg)) {
            this.currentToken = {
                type: "startTag",
                tagName: ""
            }
            return this._tagName(c)
        }
        throw new Error("in _tagOpen state, next char is neither / nor a letter")
    }

    // allowed next: letter
    _endTagOpen = (c) => {
        if (c.match(letterReg)) {
            this.currentToken = {
                type: "endTag",
                tagName: "",
            }
            return this._tagName(c)
        }
        throw new Error("in _endTagOpen state, next char is not letter")
    }

    // allowed next: letter, space, > and /
    _tagName = (c) => {
        if (c.match(letterReg)) {
            this.currentToken.tagName += c
            return this._tagName
        }
        if (c.match(spaceReg)) { return this._beforeAttributeName }
        if (c === ">") { return this._tagClosed(c) }
        if (c === "/") { return this._selfClosingTagOpen }

        throw new Error(`In _tagName having ${c}`)
    }

    // allowed next: space, letter, > and /
    _beforeAttributeName = (c) => {
        if (c.match(spaceReg)) { return this._beforeAttributeName }
        if (c.match(letterReg)) {
            this.currentAttribute = {
                name: "",
                value: "",
            }
            return this._attributeName(c)
        }
        if (c === ">") { return this._tagClosed(c) }
        if (c === "/") { return this._selfClosingTagOpen }

        throw new Error(`In _beforeAttributeName having ${c}`)
    }

    // allowed next: letter, space, =
    _attributeName = (c) => {
        if (c.match(letterReg)) {
            this.currentAttribute.name += c
            return this._attributeName
        }
        if (c.match(spaceReg)) { return this._afterAttributeName }
        if (c === "=") { return this._beforeAttributeValue }

        throw new Error(`In _attributeName having ${c}`)
    }

    // allowed next: = or space
    _afterAttributeName = (c) => {
        if (c.match(spaceReg)) { return this._afterAttributeName }
        if (c === "=") { return this._beforeAttributeValue }

        throw new Error(`In _afterAttributeName having ${c}`)
    }

    // allowed next: space, " or ', letter
    _beforeAttributeValue = (c) => {
        if (c.match(spaceReg)) { return this._beforeAttributeValue }
        if (c === `"`) { return this._doubleQuotedAttributeValue }
        if (c === `'`) { return this._singleQuotedAttributeValue }
        if (c.match(letterReg)) { return this._rawAttributeValue(c) }

        throw new Error(`In _beforeAttributeValue having ${c}`)
    }

    // allowed next: letter, space, >, /
    _rawAttributeValue = (c) => {
        if (c.match(letterReg)) {
            this.currentAttribute.value += c
            return this._rawAttributeValue
        }
        if (c.match(spaceReg)) {
            // add key val attributes into token
            this.currentToken[this.currentAttribute.name] = this.currentAttribute.value
            return this._beforeAttributeName
        }
        if (c === ">") {
            this.currentToken[this.currentAttribute.name] = this.currentAttribute.value
            return this._tagClosed(c)
        }
        if (c === "/") {
            this.currentToken[this.currentAttribute.name] = this.currentAttribute.value
            return this._selfClosingTagOpen
        }

        throw new Error(`In _rawAttributeValue having ${c}`)
    }

    // allowed next: any char besides single quote, single quote
    _singleQuotedAttributeValue = (c) => {
        if (c === `'`) {
            this.currentToken[this.currentAttribute.name] = this.currentAttribute.value
            return this._beforeAttributeName
        }
        this.currentAttribute.value += c
        return this._singleQuotedAttributeValue
    }

    // allowed next: any char besides double quote, double quote
    _doubleQuotedAttributeValue = (c) => {
        if (c === `"`) {
            this.currentToken[this.currentAttribute.name] = this.currentAttribute.value
            return this._beforeAttributeName
        }
        this.currentAttribute.value += c
        return this._rawAttribute_doubleQuotedAttributeValueValue
    }

    // allowed next: > and space
    _selfClosingTagOpen = (c) => {
        if (c === ">") {
            this.currentToken.isSelfClosing = true
            return this._tagClosed(c)
        }
        if (c.match(spaceReg)) { return this._selfClosingTagOpen }

        throw new Error(`do not recognize char in _selfClosingTagOpen: ${c}`)
    }

    // tag end with >
    _tagClosed = (c) => {
        if (c === ">") {
            // push a complete tag to the stack
            this._push_token(this.currentToken)
            this.currentToken = null
            return this._data
        }

        throw new Error(`In _tagClosed having ${c}`)
    }

}


// const testHTML = `<html a=b>
// <head d=c a='dd'>
// </head>
// <style>
//     body div.introText {
//         background: red;
//     }
// </style>
// <br />
// <body>
//     <div class='introText'>hello world</div>
// </body>
// </html>
// `

// let parser = new HTMLParser()
// let dom = parser.parse(testHTML)
// console.log(dom)

// module.exports.default = HTMLParser;
