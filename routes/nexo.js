/**
 * Created with JetBrains WebStorm.
 * User: kono
 * Date: 2013/05/07
 * Time: 13:37
 * To change this template use File | Settings | File Templates.
 */

/* global exports */

var request = require("request");
var _ = require("underscore");

var BASE_URL = "http://localhost:8182/graphs/nexo-dag/";


var ROOTS = {
    nexo: "NEXO:joining_root",
    bp: "biological_process",
    cc: "cellular_component",
    mf: "molecular_function"
};

var EMPTY_OBJ = {};
var EMPTY_ARRAY = [];
var EMPTY_CYNETWORK = {
    elements: {
        nodes: [],
        edges: []
    }
};

// TODO: change to interaction TH.
var GENE_COUNT_THRESHOLD = 1500;

var GraphUtil = function () {
};

GraphUtil.prototype = {
    generateInteractions: function (paths) {
        var pathLength = paths.length;
        console.log("# of path = " + pathLength);

        var graph = {
            elements: {
                nodes: [],
                edges: []
            }
        };

        var nodes = [];

        for (var i = 0; i < pathLength; i++) {
            var path = paths[i];
            for (var j = 0; j < path.length; j++) {
                var edge = path[j];
                var source = edge[0];
                var target = edge[1];
                var sourceId = source["Assigned Genes"];
                var targetId = target["Assigned Genes"];

                if (_.contains(nodes, sourceId) == false) {
                    var sourceNode = {
                        data: {
                            id: sourceId
                        }
                    };
                    graph.elements.nodes.push(sourceNode);
                    nodes.push(sourceId);
                }

                if (_.contains(nodes, targetId) == false) {
                    var targetNode = {
                        data: {
                            id: targetId
                        }
                    };
                    graph.elements.nodes.push(targetNode);
                    nodes.push(targetId);
                }

                var newEdge = {
                    data: {
                        id: sourceId + "(raw_interaction) " + targetId,
                        source: sourceId,
                        target: targetId
                    }
                };
                graph.elements.edges.push(newEdge);
            }
        }
        return graph;
    },

    graphGenerator: function (graphJson) {

        // Cytoscape.js style graph object.
        var graph = {
            elements: {
                nodes: [],
                edges: []
            }
        };

        var nodeIdArray = [];
        var edgeIdArray = [];

        for (var key in graphJson) {
            var path = graphJson[key];
            this.parsePathEntry(nodeIdArray, edgeIdArray, graph, path);
        }

        nodeIdArray = null;
        edgeIdArray = null;

        return graph;
    },

    edgeListGenerator: function (graphJson) {

        var pathList = [];

        for (var key in graphJson) {
            var path = graphJson[key];
            pathList.push(this.parseEdge(path));
        }

        return pathList;
    },

    parseEdge: function (path) {
        var nodeList = [];

        _.each(path, function(graphObject) {
            if (graphObject['_type'] === "vertex") {
                nodeList.push(graphObject.name);
            }
        });

        return nodeList;

    },

    parsePathEntry: function (nodes, edges, graph, path) {
        var pathLength = path.length;

        var node = {};

        for (var i = 0; i < pathLength; i++) {
            var graphObject = path[i];
            if (graphObject['_type'] === "vertex") {

                node.data = {};
                node.data.id = graphObject.name;
                if (i === 0) {
                    node.data["type"] = "start";
                } else {
                    node.data["type"] = "path";
                }
                if (_.contains(nodes, node.data.id) == false) {
                    graph.elements.nodes.push(node);
                    nodes.push(node.data.id);
                }
            } else {
                var sourceName = node.data.id;
                var target = path[i + 1];
                var targetName = "";
                if (target['_type'] != "vertex") {
                    var ex = new Error("Wrong input JSON.");
                    throw ex;
                } else {
                    targetName = target.name;
                }

                var edgeName = sourceName + " (" + graphObject._label + ") " + targetName;
                if (_.contains(edges, edgeName) == false) {

                    var edge = {
                        data: {
                            id: edgeName,
                            interaction: graphObject._label,
                            source: sourceName,
                            target: targetName
                        }
                    };
                    graph.elements.edges.push(edge);
                    edges.push(edgeName);
                }

                node = {};
            }
        }
    }
};

var graphUtil = new GraphUtil();

var Validator = function () {
};

Validator.prototype = {
    validate: function (id) {
        // Validation
        if (id === undefined || id === null || id === "") {
            return false;
        }

        var parts = id.split(":");
        if(parts.length === 2) {
            return true;
        } else if(id.match(/S/)) {
           return true;
        }

        return false;
    },

    validateQuery: function(id) {
        if (id === undefined || id === null || id === "") {
            return false;
        }

        return true;
    }

};

var validator = new Validator();

/**
 * Supported IDs are:
 *  - Ontology terms (NAMESPACE:ID)
 *  - SGD ID
 * @param req
 * @param res
 */
exports.getByID = function (req, res) {

    "use strict";

    var id = req.params.id;

    if (!validator.validate(id)) {
        console.log("INVALID: " +  id);
        res.json(EMPTY_OBJ);
        return;
    }

    var fullUrl = BASE_URL + "indices/Vertex?key=name&value=" + id.toUpperCase();

    console.log("URL = " + fullUrl);

    request.get(fullUrl, function (err, rest_res, body) {
        if (!err) {
            var results = JSON.parse(body);
            var resultArray = results.results;
            if (resultArray instanceof Array && resultArray.length !== 0) {
                res.json(resultArray[0]);
            } else {
                res.json(EMPTY_OBJ);
            }
        }
    });
};

exports.getByQuery = function (req, res) {
    "use strict";

    var rawQuery = req.params.query;
    console.log('Query = ' + rawQuery);

    // Validate
    if(validator.validateQuery(rawQuery) === false ) {
        res.json(EMPTY_ARRAY);
        return;
    }

    var phrase = rawQuery.match(/"[^"]*(?:""[^"]*)*"/g);
    console.log(phrase);

    var queryArray = [];

    var queryString = "";
    var wordsString = rawQuery;
    _.each(phrase, function(entry) {
        console.log("PH =: " + entry);
        var noQ = entry.replace(/\"/g, "");
        queryArray.push(noQ);
        noQ = noQ.replace(" ", "?");
        console.log("PH2 =: " + noQ);
        queryString = queryString + "*" + noQ + "* ";
        wordsString = wordsString.replace(entry, "");
        console.log("Cur string =: " + queryString);
    });

    console.log("Phrase string =: " + queryString);

    var words = wordsString.split(/ +/);
    var wordsCount = words.length;
    var idx = 0;
    _.each(words, function(word){
        if(word !== "") {
            queryArray.push(word);
            if(idx === 0 && queryString === "") {
                queryString = queryString + "*" + word + "* ";
            } else {
                queryString = queryString + "AND *" + word + "* ";
            }
        }
    });

    console.log("Final String = " + queryString);

    var fullUrl = BASE_URL + "tp/gremlin?params={query:'" + queryString + "'}&script=keywordSearch()&load=[bykeyword]"
        + "&rexster.returnKeys=[name,label,BP Definition,CC Definition,MF Definition," +
        "BP Annotation,CC Annotation,MF Annotation,SGD Gene Description,def]";

    console.log('FULL URL = ' + fullUrl);

    request.get(fullUrl, function (err, rest_res, body) {
        if (!err) {
            var results = JSON.parse(body);
            var resultArray = results.results;
            if (resultArray !== null && resultArray !== undefined && resultArray.length !== 0) {
                resultArray.unshift({queryArray:queryArray});
                res.json(resultArray);
            } else {
                res.json(EMPTY_ARRAY);
            }
        }
    });

    function processResult() {

    }
};

exports.getByNames = function (req, res) {

    "use strict";

    var names = req.params.names;
    var fullUrl = BASE_URL + "tp/gremlin?script=g.idx('Vertex').query('name', '" + names + "')" + "&rexster.returnKeys=[name,Assigned Genes,Assigned Orfs]";

    request.get(fullUrl, function (err, rest_res, body) {
        if (!err) {
            var results = {};
            try {
                results = JSON.parse(body);
            } catch(ex) {
                console.error("Parse error: " + ex);
                res.json(EMPTY_ARRAY);
                return;
            }

            var resultArray = results.results;
            if (resultArray !== undefined && resultArray instanceof Array && resultArray.length !== 0) {
                res.json(resultArray);
            } else {
                res.json(EMPTY_ARRAY);
            }
        } else {
            console.error("ERROR! " + err.toString());
        }
    });
};

exports.getByGeneQuery = function (req, res) {

    "use strict";

    var rawQuery = req.params.query;
    console.log('Query = ' + rawQuery);

    // Validate
    if(validator.validateQuery(rawQuery) === false ) {
        res.json(EMPTY_ARRAY);
        return;
    }

    var geneIds = rawQuery.split(/ +/g);
    var query = "";

    for(var i=0; i<geneIds.length; i++) {
        if(i === geneIds.length -1) {
            query += "*" + geneIds[i] + "*";
        } else {
            query += "*" + geneIds[i] + "* AND ";
        }
    }

    var fullUrl = BASE_URL + "tp/gremlin?params={query='" + query + "'}&script=search()&load=[bygene]" +
        "&rexster.returnKeys=[name,label,Assigned Genes,Assigned Orfs,Assigned Gene Synonyms]";
    console.log(geneIds);
    console.log('FULL URL = ' + fullUrl);
    request.get(fullUrl, function (err, rest_res, body) {
        if (!err) {
            var results = JSON.parse(body);
            var resultArray = results.results;
            if (resultArray !== undefined && resultArray instanceof Array && resultArray.length !== 0) {
                res.json(resultArray);
            } else {
                res.json(EMPTY_ARRAY);
            }
        }
    });
};

exports.getRawInteractions = function (req, res) {

    "use strict";

    var id = req.params.id;

    // Query should be list of genes
    console.log('ID = ' + id);

    var fullUrl = BASE_URL + "indices/Vertex?key=name&value=" + id + "&rexster.returnKeys=[name,Assigned Genes]";

    request.get(fullUrl, function (err, rest_res, body) {
        if (!err) {
            var results = JSON.parse(body);
            var resultArray = results.results;
            if (resultArray.length !== 0) {
                var geneArray = resultArray[0]["Assigned Genes"];

                var geneString = geneArray.toString();
                console.log("STR: " + geneString);

                var genes = geneString.replace(/,/g, " ");

                // Too many results
                var numGenes = genes.split(" ").length;
                if (numGenes > GENE_COUNT_THRESHOLD) {
                    console.log("TOO MANY inputs: " + numGenes);
                    res.json(EMPTY_CYNETWORK);
                    return;
                } else {
                    console.log("OK: " + numGenes);
                }

                var nextUrl = BASE_URL + "tp/gremlin?params={query='" + genes +
                    "'}&script=getRawInteractions()&load=[getinteractions]" +
                    "&rexster.returnKeys=[name,Assigned Genes]";

                console.log("URL == " + nextUrl);
                request.get(nextUrl, function (err2, rest_res2, body2) {
                    if (!err2) {
                        var results = JSON.parse(body2);
                        var resultArray = results.results;
                        if (resultArray.length !== 0) {
                            var graph = graphUtil.generateInteractions(resultArray);
                            var returnValue = {
                                graph: graph
                            };
                            res.json(returnValue);
                        } else {
                            res.json(EMPTY_CYNETWORK);
                        }
                    }
                });
            } else {
                res.json(EMPTY_CYNETWORK);
            }
        }
    });

};

exports.getPath = function (req, res) {
    "use strict";

    var id = req.params.id;

    if (!validator.validate(id)) {
        res.json(EMPTY_ARRAY);
        return;
    }

    var ns = "";
    if(id.match(/S/)) {
        ns = "NEXO";
    } else {
        ns = id.split(":")[0];
    }

    var rootNode = ROOTS.nexo;
    if (ns === "NEXO") {

//        getGraphUrl = getGraphUrl + "g.V.has('name', '" + id + "')" +
//            ".as('x').outE.filter{it.label != 'raw_interaction'}.filter{it.label != 'additional_gene_association'}." +
//            "filter{it.label != 'additional_parent_of'}.inV.loop('x'){it.loops < 20}" +
//            "{it.object.name.equals('" + rootNode + "')}.path&rexster.returnKeys=[name]";

        var nexoUrl = BASE_URL + "tp/gremlin?script=g.idx('Vertex')[[name: '" + id + "']]" +
            ".as('x').outE.filter{it.label != 'raw_interaction'}" +
            ".filter{it.label != 'raw_interaction_physical'}.filter{it.label != 'raw_interaction_genetic'}" +
            ".filter{it.label != 'raw_interaction_co_expression'}.filter{it.label != 'raw_interaction_yeastNet'}" +
            ".inV.loop('x'){it.loops < 20}" +
            "{it.object.name=='" + rootNode + "'}.path&rexster.returnKeys=[name]";

        console.log("NEXO found: " + nexoUrl);

        request.get(nexoUrl, function (err, rest_res, body) {
            if (!err) {
                var results = JSON.parse(body);
                var resultArray = results.results;
                if (resultArray !== undefined && resultArray.length !== 0) {
//                    var graph = graphUtil.graphGenerator(resultArray);
                    var pathList = graphUtil.edgeListGenerator(resultArray);
                    res.json(pathList);
                } else {
                    res.json(EMPTY_ARRAY);
                }
            }
        });
    } else {
        var getNamespaceUrl = BASE_URL + "indices/Vertex?key=name&value=" + id + "&rexster.returnKeys=[namespace]";

        request.get(getNamespaceUrl, function (err, rest_res, body) {
            if (!err) {

                var results = {};
                try {
                    results = JSON.parse(body);
                } catch(ex) {
                    console.log(ex);
                    res.json(EMPTY_ARRAY);
                    return;
                }

                var resultObj = results.results;
                if (resultObj !== undefined && resultObj.length === 1) {

                    var nameSpace = resultObj[0].namespace;
                    var startNodeId = resultObj[0]._id;

                    var getGraphUrl = BASE_URL + "tp/gremlin?script=";
                    rootNode = nameSpace;

                    getGraphUrl = getGraphUrl + "g.v(" + startNodeId + ")" +
                        ".as('x').outE.inV.loop('x'){it.loops < 20}" +
                        "{it.object.'term name'.equals('" + rootNode + "')}.path&rexster.returnKeys=[name]";

                    console.log("Final URL: " + getGraphUrl);

                    request.get(getGraphUrl, function (err_in, rest_res_in, body_in) {
                        if (!err_in) {
                            var results = JSON.parse(body_in);
                            var resultArray = results.results;
                            if (resultArray !== undefined && resultArray instanceof Array && resultArray.length !== 0) {
                                var pathList = graphUtil.edgeListGenerator(resultArray);
                                res.json(pathList);
                            } else {
                                res.json(EMPTY_ARRAY);
                            }
                        }
                    });
                } else {
                    res.json(EMPTY_ARRAY);
                }
            }
        });
    }
};


exports.getAllParents = function (req, res) {
    "use strict";

    var id = req.params.id;

    var getGraphUrl = BASE_URL + "tp/gremlin?script=";

    getGraphUrl = getGraphUrl + "g.V.has('name', '" + id + "')" +
        ".as('x').outE.filter{it.label != 'raw_interaction'}.filter{it.label != 'additional_gene_association'}" +
        ".inV&rexster.returnKeys=[name]";

    console.log('URL = ' + getGraphUrl);

    request.get(getGraphUrl, function (err, rest_res, body) {
        if (!err) {
            var results = JSON.parse(body);
            var resultArray = results.results;
            if (resultArray !== undefined && resultArray.length !== 0) {
                res.json(resultArray);
            } else {
                res.json(EMPTY_ARRAY);
            }
        }
    });
};

exports.getGeneNames = function (req, res) {
    "use strict";

    var id = req.params.id;

    var getGraphUrl = BASE_URL + "tp/gremlin?script=";

    getGraphUrl = getGraphUrl + "g.V.has('name', '" + id + "')" +
        ".as('x').outE.filter{it.label != 'raw_interaction'}.filter{it.label != 'additional_gene_association'}" +
        ".inV&rexster.returnKeys=[name]";

    console.log('URL = ' + getGraphUrl);

    request.get(getGraphUrl, function (err, rest_res, body) {
        if (!err) {
            var results = JSON.parse(body);
            var resultArray = results.results;
            if (resultArray !== undefined && resultArray.length !== 0) {
                res.json(resultArray);
            } else {
                res.json(EMPTY_ARRAY);
            }
        }
    });
};