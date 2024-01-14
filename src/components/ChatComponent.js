import Web3 from 'web3';
import React, { Component } from 'react';
import MApp from '../abis/MApp.json'

class ChatComponent extends Component {

    async componentWillMount() {
        await this.initializeWeb3()
        await this.loadBlockchainData()
        await this.listenToMessages()
        await this.listenToEther()
        await this.listenToAskEther()
        await this.listenToFetchAllMsg()
        await this.fetchAllMsg()
        await this.updateUIData()
      }

    constructor(props) {
        super(props)
        let chats = [
            {
                msg: "Type message",
                response: true
            },
            {
                msg: "Send \"ETH: 0.0001\"",
                response: false
            }
        ]
        this.state = {
            fixedChats: chats,
            chats: [],
            inputValue: '',
            accounts: [],
            account: '',
            nbBlocks: 0,
            otherAccount: '',
            accountNbTransactions: 0,
            otherAccountNbTransactions: 0,
            accountBalance: 0,
            otherAccountBalance: 0,
            lastGas: 0,
            blockHash: '',
            didATransaction: false,
            isLastTransactionSuccess: false,
            didARequest: false,
            accountRequesting: '',
            accountRequested: '',
            valueRequested: 0,
        }
    }
    async initializeWeb3() {
        if (window.ethereum) {
          window.web3 = new Web3(Web3.providers.WebsocketProvider("ws://localhost:7545"))
          await window.ethereum.enable()
        }
        else if (window.web3) {
          window.web3 = new Web3(window.web3.currentProvider)
        }
        else {
          window.alert('Unsupported browser')
        }
      }

    async loadBlockchainData()  {
        const web3 = window.web3
    
        const accounts = await web3.eth.getAccounts()
        this.setState({ 
            accounts: accounts,
            account: accounts[0],
            otherAccount: accounts[1]
         })
        console.log(accounts)
    
        const ethBalance = await web3.eth.getBalance(this.state.account)
        this.setState({ ethBalance })
  
        const networkId =  await web3.eth.net.getId()
        const chatAppData = MApp.networks[networkId]
        const abi = MApp.abi
        if(chatAppData) {
          const chatContract = new web3.eth.Contract(abi, chatAppData.address)
          this.setState({ chatContract: chatContract })
        }
        else {
            window.alert('Not deployed')
        }
    }
    async listenToMessages() {
        var binded = this.didReceiveMessageBinded.bind(this)
        this.state.chatContract.events.messageSentEvent({})
        .on('data', binded)
        .on('error', console.error);
    }

    async listenToEther() {
        var binded = this.didReceiveEtherBinded.bind(this)
        this.state.chatContract.events.etherSentEvent({})
        .on('data', binded)
        .on('error', console.error);
    }

    async listenToAskEther() {
        var binded = this.didReceiveAskEtherBinded.bind(this)
        this.state.chatContract.events.etherAskEvent({})
        .on('data', binded)
        .on('error', console.error);
    }

    async listenToFetchAllMsg() {
        var binded = this.didReceiveAllMsgBinded.bind(this)
        this.state.chatContract.events.messagesFetchedEvent({})
        .on('data', binded)
        .on('error', console.error);
    }

    async didReceiveMessageBinded(event){
        const message = event.returnValues.message
        if (event.returnValues.from === this.state.account){
            this.didReceiveMessage(message, true)
        }
        if (event.returnValues.to === this.state.account){
            this.didReceiveMessage(message, false)
        }
        this.setState({
            didATransaction: false,
            didARequest: false,
        })
        await this.updateUIData()
    }

    async didReceiveEtherBinded(event) {
        this.setState({
            didATransaction: true,
            didARequest: false,
            isLastTransactionSuccess: event.returnValues.success
        })
 
        await this.updateUIData()
    }

    async didReceiveAskEtherBinded(event){
        if (this.state.account === event.returnValues.to) {
            let value_as_wei = window.web3.utils.fromWei(
                event.returnValues.value, "ether")
    
            this.setState({
                didATransaction: false,
                didARequest: true,
                accountRequesting: event.returnValues.from,
                accountRequested: event.returnValues.to,
                valueRequested: value_as_wei,
            })
            await this.updateUIData()
        }
    }

    async didReceiveAllMsgBinded(event){
        let allMsg = []

        event.returnValues.messages.forEach((message) => {
            allMsg.push({
                msg: message['message'],
                response: message['from'] === this.state.account
            })
        })
        if (allMsg.length === 0)
            allMsg = this.state.fixedChats

        this.setState({
            chats: allMsg
        })
        await this.updateUIData()
    }

    async didReceiveMessage(message, isResponse) {
        let chats = this.state.chats
        chats.push(
            {
                msg: message,
                response: isResponse
            }
        )
        this.setState({
            chats: chats,
            inputValue: ''
        })
    }

    async didSendMessage(message) {
        this.state.chatContract.methods.sendMsg(this.state.otherAccount, message)
            .send({ from: this.state.account, gas: 1500000 })
        await this.sendEtherIfAsked()
        await this.askEtherIfAsked()
    }

    async sendEtherIfAsked() {
        let splitted = this.state.inputValue.split(':')
        if (splitted.length !== 2)
            return false

        if (splitted[0] === "send_ether" && this.isNumeric(splitted[1])) {
            let asWei = parseFloat(splitted[1]) * 1e18
            this.state.chatContract.methods.sendEther(this.state.otherAccount).send({
                from: this.state.account,
                value: asWei
            })
            return true
        }
        return false
    }

    async askEtherIfAsked() {
        let splitted = this.state.inputValue.split(':')
        if (splitted.length !== 2)
            return false

        if (splitted[0] === "ask_ether" && this.isNumeric(splitted[1])) {
            var asWei = (parseFloat(splitted[1]) * 1e18).toString()
            this.state.chatContract.methods.askEther(this.state.otherAccount, asWei).send({ from: this.state.account })
            return true
        }
        return false
    }

    async fetchAllMsg() {
        await this.state.chatContract.methods.getAllMsg(this.state.otherAccount).send({ from: this.state.account })
    }
    async updateUIData() {
        await this.updateNbTransactions()
        await this.updateBalances()
        await this.updateBlocks()
        await this.updateLastGas()
    }

    updateInputValue(evt) {
        this.setState({
          inputValue: evt.target.value
        });
      }

    async updateAddressSelect(newValue, isOtherAccount) {
        if (isOtherAccount) {
            this.setState({
                otherAccount: newValue,
                chats: this.state.fixedChats
            })
        }
        else {
            this.setState({
                account: newValue,
                chats: this.state.fixedChats
            })
        }
        await this.wait()
        await this.fetchAllMsg()
        await this.updateUIData()
    }

    async updateNbTransactions() {
        let accountNbTransactions = await window.web3.eth.getTransactionCount(this.state.account)
        let otherAccountNbTransactions = await window.web3.eth.getTransactionCount(this.state.otherAccount)
        this.setState({
            accountNbTransactions: accountNbTransactions,
            otherAccountNbTransactions: otherAccountNbTransactions
        })
    }

    async updateBalances() {
        let accountBalance = await window.web3.eth.getBalance(this.state.account)
        let otherAccountBalance = await window.web3.eth.getBalance(this.state.otherAccount)
        this.setState({
            accountBalance: window.web3.utils.fromWei(accountBalance, 'ether'),
            otherAccountBalance: window.web3.utils.fromWei(otherAccountBalance, 'ether')
        })
    }

    async updateBlocks() {
        const latest = await window.web3.eth.getBlockNumber()
        this.setState({
            nbBlocks: latest
        })
    }

    async updateLastGas() {
        const lastBlockNumber = await window.web3.eth.getBlockNumber();
        let block = await window.web3.eth.getBlock(lastBlockNumber);
        block = await window.web3.eth.getBlock(lastBlockNumber);

        const lastTransaction = block.transactions[block.transactions.length - 1];
        const transaction = await window.web3.eth.getTransaction(lastTransaction);

        this.setState({
            blockHash: transaction["blockHash"],
            lastGas: transaction["gas"],
        })
    }
    getMessagesAsDivs() {
        let chatDivs = this.state.chats.map(x => x.response ? 
            <div class="message text-only">
                <div class="response">
                    <p class="text"> {x.msg} </p>
                    </div>
                </div> :
            <div class="message text-only">
                <p class="text"> {x.msg} </p>
            </div>
        )
        return chatDivs.reverse()
    }

    getToggleAdresses(isOtherAccount) {
            var addresses = []
        
            const senderCount = 10;
        
            for (var i = 1; i <= senderCount; i++) {
                let senderName = `Sender ${i}`;
                let senderAddress = this.state.accounts[i - 1]; 
        
                if ((isOtherAccount && senderAddress === this.state.otherAccount) ||
                    (!isOtherAccount && senderAddress === this.state.account))
                    addresses.push(<option value={senderAddress} selected>{senderName}</option>)
                else {
                    addresses.push(<option value={senderAddress}>{senderName}</option>)
                }
            }
        
            return addresses; 
    }

    displayEtherTransactionStatus() {
        if (!this.state.didATransaction)
            return

        if (this.state.isLastTransactionSuccess)
            return <div style={{color: "green"}}>ETH transaction succeeded!</div>
        else
            return <div>error</div>
    }

    displayAskEtherPopUp() {
        let to = this.state.accountRequested
        let valueAsEther = this.state.valueRequested
        let valueAsWei = parseFloat(this.state.valueRequested) * 1e18
        
        if (this.state.didARequest && to === this.state.account) {
            return (
            <div className="didAskContainer">
                <h6>Ether request</h6>
                <p>Account { to } requests you { valueAsEther } ether.</p>
                
                <button class="btn btn-success send-btn" onClick={() => this.state.chatContract.methods.sendEther(this.state.accountRequesting).send({
                    from: to,
                    value: valueAsWei
                })}>Accept</button>
            </div>
            )
        }
        return
    }
    isNumeric(str) {
        if (typeof str != "string") return false
        return !isNaN(str) &&
               !isNaN(parseFloat(str))
      }

    async wait() {
        const noop = ()=>{};
        for (var i = 0; i < 10000; i++)
            noop()
    }
    render() {
        return (
        <body>
            <div class="block-container">
                <div class="row">
                    <div class="col-9 left-block">
                        <section class="chat">
                            <div class="messages-chat">
                            { this.getMessagesAsDivs() }
                            </div>
                        </section>
                        <div class="footer-chat">
                            <input value={this.state.inputValue} onChange={evt => this.updateInputValue(evt)} type="text" class="write-message" placeholder="Message"></input>
                            <i class="fa fa-paper-plane-o" aria-hidden="true"></i>
                            <button class="btn btn-success send-btn" onClick={() => this.didSendMessage(this.state.inputValue)}>Send</button>
                        </div>
                    </div>
                    <div class="col-3 right-block">
                        <h4>Select Sender</h4>
                        <div class="left">
                                    <select class="custom-select" onChange={e => this.updateAddressSelect(e.target.value, false)} >
                                        { this.getToggleAdresses(false) }
                                    </select>     
                                </div> <br/> <br/>
                        <h4>Select Receiver</h4>
                        <div class="left">
                                    <select class="custom-select" onChange={e => this.updateAddressSelect(e.target.value, true)} >
                                        { this.getToggleAdresses(true) }
                                    </select>  
                                </div>
                    </div>
                </div>
                
                </div>
                
        </body>
    );

    }

}

export default ChatComponent;